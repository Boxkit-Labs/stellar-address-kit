/**
 * SEP-0002 Federation Address Resolution
 *
 * Resolves a human-readable federation address (`user*domain.com`) into a
 * normalized `RoutingInput` that can be passed directly to `extractRouting`.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0002.md
 */

import type { RoutingInput } from "./types";

export type FederationResolutionErrorCode =
  | "INVALID_FEDERATION_ADDRESS"
  | "STELLAR_TOML_FETCH_FAILED"
  | "FEDERATION_SERVER_NOT_FOUND"
  | "FEDERATION_LOOKUP_FAILED"
  | "INVALID_FEDERATION_RESPONSE";

/**
 * Raised when a federation address cannot be resolved.
 * Includes a machine-readable `code` describing the failure stage.
 */
export class FederationResolutionError extends Error {
  readonly code: FederationResolutionErrorCode;

  constructor(code: FederationResolutionErrorCode, message: string) {
    super(message);
    this.name = "FederationResolutionError";
    this.code = code;
    Object.setPrototypeOf(this, FederationResolutionError.prototype);
  }
}

export type ResolveFederationAddressOptions = {
  /** Fetch implementation used for network calls. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

type FederationRecord = {
  account_id?: unknown;
  memo_type?: unknown;
  memo?: unknown;
};

const FEDERATION_SERVER_PATTERN =
  /^\s*FEDERATION_SERVER\s*=\s*["']([^"']+)["']/im;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseFederationAddress(federationAddress: unknown): {
  address: string;
  domain: string;
} {
  if (typeof federationAddress !== "string" || federationAddress.trim() === "") {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_ADDRESS",
      "Invalid federation address: expected a non-empty string."
    );
  }

  const address = federationAddress.trim();
  const separator = address.lastIndexOf("*");
  if (separator <= 0 || separator === address.length - 1) {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_ADDRESS",
      `Invalid federation address: expected "user*domain.com", got "${address}".`
    );
  }

  const user = address.slice(0, separator);
  const domain = address.slice(separator + 1);

  if (
    /\s/.test(user) ||
    /\s/.test(domain) ||
    /[/:@?#]/.test(domain) ||
    !domain.includes(".")
  ) {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_ADDRESS",
      `Invalid federation address: expected "user*domain.com", got "${address}".`
    );
  }

  return { address, domain };
}

async function request(
  fetchImpl: typeof fetch,
  url: string,
  accept: string,
  code: FederationResolutionErrorCode,
  label: string
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Accept: accept } });
  } catch (error) {
    throw new FederationResolutionError(
      code,
      `${label} request failed: ${errorMessage(error)}`
    );
  }

  if (!response.ok) {
    throw new FederationResolutionError(
      code,
      `${label} returned HTTP ${response.status}.`
    );
  }

  return response;
}

/**
 * Resolves a SEP-0002 federation address to a normalized routing input.
 *
 * The lookup follows the SEP-0002 flow: fetch `stellar.toml` from the address
 * domain, read its `FEDERATION_SERVER`, then query that server with
 * `q=<address>&type=name`.
 *
 * @param federationAddress - Federation address such as `bob*example.com`.
 * @param options - Optional dependencies, primarily for testing.
 * @returns A `RoutingInput` ready for `extractRouting`.
 * @throws {FederationResolutionError} If the address is malformed, the TOML or
 * federation lookup fails, or the response is invalid.
 *
 * @example
 * ```ts
 * const input = await resolveFederationAddress("bob*example.com");
 * const result = extractRouting(input);
 * ```
 */
export async function resolveFederationAddress(
  federationAddress: string,
  options: ResolveFederationAddressOptions = {}
): Promise<RoutingInput> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { address, domain } = parseFederationAddress(federationAddress);

  const tomlUrl = `https://${domain}/.well-known/stellar.toml`;
  const tomlResponse = await request(
    fetchImpl,
    tomlUrl,
    "text/plain",
    "STELLAR_TOML_FETCH_FAILED",
    "stellar.toml"
  );

  let toml: string;
  try {
    toml = await tomlResponse.text();
  } catch (error) {
    throw new FederationResolutionError(
      "STELLAR_TOML_FETCH_FAILED",
      `Failed to read stellar.toml: ${errorMessage(error)}`
    );
  }

  const federationServer = toml.match(FEDERATION_SERVER_PATTERN)?.[1]?.trim();
  if (!federationServer) {
    throw new FederationResolutionError(
      "FEDERATION_SERVER_NOT_FOUND",
      `No FEDERATION_SERVER found in stellar.toml for "${domain}".`
    );
  }

  let lookupUrl: URL;
  try {
    lookupUrl = new URL(federationServer);
  } catch {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_RESPONSE",
      `Invalid FEDERATION_SERVER URL: "${federationServer}".`
    );
  }

  if (lookupUrl.protocol !== "https:") {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_RESPONSE",
      `FEDERATION_SERVER must use https, got "${federationServer}".`
    );
  }

  lookupUrl.searchParams.set("q", address);
  lookupUrl.searchParams.set("type", "name");

  const lookupResponse = await request(
    fetchImpl,
    lookupUrl.toString(),
    "application/json",
    "FEDERATION_LOOKUP_FAILED",
    "Federation lookup"
  );

  let record: FederationRecord;
  try {
    record = (await lookupResponse.json()) as FederationRecord;
  } catch (error) {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_RESPONSE",
      `Federation lookup returned invalid JSON: ${errorMessage(error)}`
    );
  }

  if (
    typeof record !== "object" ||
    record === null ||
    Array.isArray(record) ||
    typeof record.account_id !== "string" ||
    record.account_id.trim() === ""
  ) {
    throw new FederationResolutionError(
      "INVALID_FEDERATION_RESPONSE",
      "Federation lookup response is missing a valid account_id."
    );
  }

  const memo = record.memo;
  const hasMemo = memo !== undefined && memo !== null;

  let memoType = "none";
  if (hasMemo) {
    memoType =
      typeof record.memo_type === "string" && record.memo_type.trim() !== ""
        ? record.memo_type.trim().toLowerCase()
        : "text";
  }

  return {
    destination: record.account_id.trim(),
    memoType,
    memoValue: hasMemo ? String(memo) : null,
    sourceAccount: null,
  };
}
