import { detect } from "../address/detect";
import { normalizeMemoTextId, validateMemo } from "./memo";
import { KnownMemoType, RoutingInput } from "./types";

/**
 * SEP-0002 federation address resolution.
 *
 * Resolves a human-readable `name*domain.tld` address into a normalized
 * {@link RoutingInput} by:
 *   1. fetching `https://<domain>/.well-known/stellar.toml` (SEP-0001) and
 *      reading its `FEDERATION_SERVER`,
 *   2. querying `<FEDERATION_SERVER>?q=<address>&type=name`,
 *   3. validating the returned `account_id` / `memo_type` / `memo`.
 */

export type FederationErrorCode =
  | "INVALID_FEDERATION_ADDRESS"
  | "STELLAR_TOML_FETCH_FAILED"
  | "FEDERATION_SERVER_NOT_FOUND"
  | "FEDERATION_LOOKUP_FAILED"
  | "INVALID_FEDERATION_RESPONSE";

/**
 * Error thrown by {@link resolveFederationAddress}. `code` is machine-readable.
 */
export class FederationError extends Error {
  code: FederationErrorCode;
  readonly input: string;

  constructor(code: FederationErrorCode, input: string, message: string) {
    super(message);
    this.name = "FederationError";
    this.code = code;
    this.input = input;
    Object.setPrototypeOf(this, FederationError.prototype);
  }
}

/** The subset of the WHATWG `Response` used by the resolver. */
export type FederationFetchResponse = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
};

/** The subset of the WHATWG `RequestInit` used by the resolver. */
export type FederationFetchInit = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  redirect?: "error" | "follow" | "manual";
};

/** A `fetch`-compatible function. Inject one to mock or customize HTTP. */
export type FederationFetch = (
  url: string,
  init?: FederationFetchInit
) => Promise<FederationFetchResponse>;

export type ResolveFederationOptions = {
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetchImpl?: FederationFetch;
  /** Per-request timeout in milliseconds. Defaults to 10000. */
  timeoutMs?: number;
};

export type ParsedFederationAddress = {
  name: string;
  domain: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
/** Upper bound on any response body we are willing to read. */
const MAX_BODY_BYTES = 100 * 1024;
const MAX_ADDRESS_LENGTH = 320;
const MAX_NAME_LENGTH = 64;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MEMO_TYPES = new Set(["text", "id", "hash"]);

/**
 * Parses and validates the syntax of a federation address (`name*domain.tld`).
 *
 * The name may not contain `*`, `>`, whitespace or control characters. The
 * domain must be a plain DNS hostname (no scheme, port, path, userinfo or IP
 * literal). The domain is lowercased; internationalized domains are converted
 * to punycode.
 *
 * @throws {FederationError} `INVALID_FEDERATION_ADDRESS`
 */
export function parseFederationAddress(address: string): ParsedFederationAddress {
  const fail = (reason: string): never => {
    throw new FederationError(
      "INVALID_FEDERATION_ADDRESS",
      String(address),
      `Invalid federation address: ${reason}.`
    );
  };

  if (typeof address !== "string" || address.length === 0) {
    return fail("address must be a non-empty string");
  }
  if (address.length > MAX_ADDRESS_LENGTH) {
    return fail("address is too long");
  }

  const parts = address.split("*");
  if (parts.length !== 2) {
    return fail("expected exactly one '*' in the form name*domain.tld");
  }

  const [name, rawDomain] = parts;

  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return fail(`name must be 1-${MAX_NAME_LENGTH} characters`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\s>\u0000-\u001f\u007f]/u.test(name)) {
    return fail("name contains whitespace, control characters or '>'");
  }

  if (rawDomain.length === 0 || /[\s/\\?#@:]/u.test(rawDomain)) {
    return fail("domain must be a plain hostname");
  }

  let domain: string;
  try {
    domain = new URL(`https://${rawDomain}`).hostname.toLowerCase();
  } catch {
    return fail("domain is not a valid hostname");
  }
  if (domain.endsWith(".")) {
    domain = domain.slice(0, -1);
  }

  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    !labels.every((label) => DOMAIN_LABEL.test(label))
  ) {
    return fail("domain must be a valid hostname such as example.com");
  }
  // Reject IPv4 literals (all-numeric TLD) so addresses cannot target IPs.
  if (/^\d+$/.test(labels[labels.length - 1])) {
    return fail("domain must not be an IP address");
  }

  return { name, domain };
}

/**
 * Extracts the top-level `FEDERATION_SERVER` string from a stellar.toml
 * document. Only keys before the first `[table]` header are considered.
 */
function readFederationServer(toml: string): string | null {
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("[")) {
      return null;
    }
    const match =
      /^FEDERATION_SERVER\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(?:#.*)?$/.exec(
        line
      );
    if (match) {
      const value = match[1] !== undefined ? match[1].replace(/\\(.)/g, "$1") : match[2];
      return value.trim() === "" ? null : value.trim();
    }
  }
  return null;
}

function toFederationServerUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return null;
  }
  const host = url.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.includes(":") || // IPv6 literal
    /^\d+(?:\.\d+){3}$/.test(host) // IPv4 literal
  ) {
    return null;
  }
  return url;
}

async function fetchText(
  fetchImpl: FederationFetch,
  url: string,
  timeoutMs: number,
  accept: string
): Promise<{ status: number; ok: boolean; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: accept },
      // Never follow redirects: they could bounce us to internal hosts.
      redirect: "error",
    });
    if (!res.ok) {
      return { status: res.status, ok: false, body: "" };
    }
    const declared = res.headers?.get("content-length");
    if (declared && /^\d+$/.test(declared) && parseInt(declared, 10) > MAX_BODY_BYTES) {
      throw new Error("response body too large");
    }
    const body = await res.text();
    if (body.length > MAX_BODY_BYTES) {
      throw new Error("response body too large");
    }
    return { status: res.status, ok: true, body };
  } finally {
    clearTimeout(timer);
  }
}

function base64ToHex(value: string): string | null {
  // MEMO_HASH is exactly 32 bytes -> 44 base64 characters ending in a single '='.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return null;
  }
  try {
    const bin = atob(value);
    let hex = "";
    for (let i = 0; i < bin.length; i++) {
      hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * Resolves a SEP-0002 federation address (`user*domain.com`) into a
 * {@link RoutingInput} ready to pass to `extractRouting`.
 *
 * @param address - The federation address to resolve.
 * @param options - Optional `fetchImpl` and `timeoutMs`.
 * @returns A `RoutingInput` with the resolved `destination`, the memo type
 * (`"none"` when the server returns none) and memo value. `MEMO_HASH` values,
 * which SEP-0002 transmits as base64, are returned as 64 hex characters.
 * @throws {FederationError} with one of `INVALID_FEDERATION_ADDRESS`,
 * `STELLAR_TOML_FETCH_FAILED`, `FEDERATION_SERVER_NOT_FOUND`,
 * `FEDERATION_LOOKUP_FAILED` or `INVALID_FEDERATION_RESPONSE`.
 */
export async function resolveFederationAddress(
  address: string,
  options: ResolveFederationOptions = {}
): Promise<RoutingInput> {
  const { domain } = parseFederationAddress(address);

  const fetchImpl: FederationFetch | undefined =
    options.fetchImpl ??
    (typeof globalThis.fetch === "function"
      ? (globalThis.fetch.bind(globalThis) as unknown as FederationFetch)
      : undefined);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!fetchImpl) {
    throw new FederationError(
      "STELLAR_TOML_FETCH_FAILED",
      address,
      "No fetch implementation available; provide options.fetchImpl."
    );
  }

  // 1. stellar.toml -> FEDERATION_SERVER
  const tomlUrl = `https://${domain}/.well-known/stellar.toml`;
  let toml: string;
  try {
    const res = await fetchText(fetchImpl, tomlUrl, timeoutMs, "text/plain");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    toml = res.body;
  } catch (err) {
    throw new FederationError(
      "STELLAR_TOML_FETCH_FAILED",
      address,
      `Failed to fetch ${tomlUrl}: ${err instanceof Error ? err.message : String(err)}.`
    );
  }

  const serverRaw = readFederationServer(toml);
  const serverUrl = serverRaw === null ? null : toFederationServerUrl(serverRaw);
  if (serverUrl === null) {
    throw new FederationError(
      "FEDERATION_SERVER_NOT_FOUND",
      address,
      `${tomlUrl} does not declare a usable https FEDERATION_SERVER.`
    );
  }

  // 2. Federation lookup
  serverUrl.searchParams.set("q", address);
  serverUrl.searchParams.set("type", "name");
  let payload: string;
  try {
    const res = await fetchText(
      fetchImpl,
      serverUrl.toString(),
      timeoutMs,
      "application/json"
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    payload = res.body;
  } catch (err) {
    throw new FederationError(
      "FEDERATION_LOOKUP_FAILED",
      address,
      `Federation lookup for ${address} failed: ${err instanceof Error ? err.message : String(err)}.`
    );
  }

  // 3. Validate response
  const invalid = (reason: string): never => {
    throw new FederationError(
      "INVALID_FEDERATION_RESPONSE",
      address,
      `Invalid federation response: ${reason}.`
    );
  };

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return invalid("body is not valid JSON");
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return invalid("body is not a JSON object");
  }
  const body = json as Record<string, unknown>;

  const accountId = body.account_id;
  if (typeof accountId !== "string") {
    return invalid("account_id is missing or not a string");
  }
  const kind = detect(accountId);
  if (kind !== "G" && kind !== "M") {
    return invalid("account_id is not a valid G or M address");
  }

  if (
    body.stellar_address !== undefined &&
    (typeof body.stellar_address !== "string" ||
      body.stellar_address.toLowerCase() !== address.toLowerCase())
  ) {
    return invalid("stellar_address does not match the queried address");
  }

  const memoType = body.memo_type;
  const memo = body.memo;
  let outType: string = "none";
  let outValue: string | null = null;

  if (memoType === undefined || memoType === null) {
    if (memo !== undefined && memo !== null) {
      return invalid("memo present without memo_type");
    }
  } else {
    if (typeof memoType !== "string" || !MEMO_TYPES.has(memoType)) {
      return invalid("memo_type must be one of text, id, hash");
    }
    // memo ids are 64-bit: a JSON number would silently lose precision.
    if (typeof memo !== "string" || memo === "") {
      return invalid("memo must be a non-empty string when memo_type is set");
    }
    if (memoType === "hash") {
      const hex = base64ToHex(memo);
      if (hex === null) {
        return invalid("hash memo must be a base64-encoded 32-byte value");
      }
      outValue = hex;
    } else if (memoType === "id") {
      const { normalized } = normalizeMemoTextId(memo);
      if (normalized === null) {
        return invalid("id memo must be an unsigned 64-bit integer");
      }
      outValue = normalized;
    } else {
      outValue = memo;
    }
    const check = validateMemo(outValue, memoType as KnownMemoType);
    if (!check.valid) {
      return invalid(check.error?.message ?? "memo failed validation");
    }
    outType = memoType;
  }

  return {
    destination: accountId.toUpperCase(),
    memoType: outType,
    memoValue: outValue,
    sourceAccount: null,
  };
}
