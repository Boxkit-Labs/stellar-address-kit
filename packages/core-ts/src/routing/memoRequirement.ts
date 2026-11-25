import { extractRouting } from "./extract";
import { RoutingInput, RoutingResult } from "./types";
import { Warning, WarningSeverity } from "../address/types";

/**
 * SEP-0029 account data keys that flag a destination as requiring a memo.
 *
 * `config.memo_required` is the key defined by SEP-0029. `config.requiring_memo`
 * is a variant seen on some custodial accounts and is honoured as well.
 */
export const MEMO_REQUIRED_DATA_KEYS = [
  "config.memo_required",
  "config.requiring_memo",
] as const;

export const MISSING_REQUIRED_MEMO_MESSAGE =
  "Destination account requires a memo (SEP-0029), but no routing ID was provided.";

export const DEFAULT_HORIZON_URL = "https://horizon.stellar.org";

const DEFAULT_TIMEOUT_MS = 10_000;

const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

/** Minimal subset of the WHATWG `fetch` signature used for Horizon lookups. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type MemoRequirementOptions = {
  /** Horizon base URL. Defaults to the public network, {@link DEFAULT_HORIZON_URL}. */
  horizonUrl?: string;
  /** `fetch` implementation. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Request timeout in milliseconds. Defaults to 10 000. Use 0 to disable. */
  timeoutMs?: number;
  /** Optional caller-supplied abort signal. */
  signal?: AbortSignal;
};

/**
 * Resolves whether a base account requires a memo. Accepts any source
 * (Horizon, an indexer, a cache); {@link fetchMemoRequirement} is the default.
 */
export type MemoRequirementFetcher = (accountId: string) => Promise<boolean>;

export type ExtractRoutingAsyncOptions = MemoRequirementOptions & {
  /** Forwarded to {@link extractRouting}. */
  allowHashRouting?: boolean;
  /**
   * Custom requirement lookup. When provided, Horizon options are ignored and
   * this function is called with the destination base account instead.
   */
  fetchMemoRequirement?: MemoRequirementFetcher;
};

export class MemoRequirementLookupError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MemoRequirementLookupError";
    this.status = status;
    Object.setPrototypeOf(this, MemoRequirementLookupError.prototype);
  }
}

function decodeBase64(value: string): string | null {
  try {
    // atob is available in browsers and Node >= 16; fall back to Buffer.
    if (typeof globalThis.atob === "function") return globalThis.atob(value);
    return Buffer.from(value, "base64").toString("latin1");
  } catch {
    return null;
  }
}

/**
 * Returns true when a decoded SEP-0029 data value marks the account as
 * requiring a memo. SEP-0029 specifies the value `1`; `true` is also accepted.
 */
function isTruthyFlag(decoded: string | null): boolean {
  if (decoded === null) return false;
  const v = decoded.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Inspects the `data` object of a Horizon account record (values are base64
 * encoded) and reports whether any SEP-0029 memo-required flag is set.
 */
export function isMemoRequiredFromAccountData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return MEMO_REQUIRED_DATA_KEYS.some((key) => {
    const raw = record[key];
    return typeof raw === "string" && isTruthyFlag(decodeBase64(raw));
  });
}

/**
 * Queries Horizon `GET /accounts/{accountId}` and reports whether the account
 * requires a memo per SEP-0029.
 *
 * - Resolves `false` when the account does not exist (HTTP 404): an
 *   unfunded account cannot carry SEP-0029 data entries.
 * - Rejects with {@link MemoRequirementLookupError} for any other non-2xx
 *   response, a network failure, a timeout, or an unreadable body.
 */
export async function fetchMemoRequirement(
  accountId: string,
  options: MemoRequirementOptions = {}
): Promise<boolean> {
  const fetchImpl: FetchLike | undefined =
    options.fetch ??
    (typeof globalThis.fetch === "function"
      ? (globalThis.fetch.bind(globalThis) as unknown as FetchLike)
      : undefined);

  if (!fetchImpl) {
    throw new MemoRequirementLookupError(
      "No fetch implementation available; pass options.fetch."
    );
  }

  const base = (options.horizonUrl ?? DEFAULT_HORIZON_URL).replace(/\/+$/, "");
  const url = `${base}/accounts/${encodeURIComponent(accountId)}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      throw new MemoRequirementLookupError(
        `Horizon request failed: ${(error as Error)?.message ?? String(error)}`
      );
    }

    if (response.status === 404) return false;
    if (!response.ok) {
      throw new MemoRequirementLookupError(
        `Horizon responded with HTTP ${response.status}`,
        response.status
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MemoRequirementLookupError(
        "Horizon response was not valid JSON",
        response.status
      );
    }

    const data =
      body && typeof body === "object"
        ? (body as { data?: unknown }).data
        : undefined;
    return isMemoRequiredFromAccountData(data);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Runs {@link extractRouting} and then checks the destination's SEP-0029 memo
 * requirement. When the account requires a memo but no routing ID was
 * extracted, a `MISSING_REQUIRED_MEMO` warning with severity `error` is
 * appended.
 *
 * The lookup is skipped when the synchronous result has no base account,
 * already carries a routing ID (including every M-address), or reports a
 * destination error. Lookup failures fail open: the synchronous result is
 * returned unchanged, so a Horizon outage never breaks parsing.
 *
 * Errors thrown by {@link extractRouting} itself (for example an empty or
 * non G/M destination) propagate exactly as they do from the sync API.
 */
export async function extractRoutingAsync(
  input: RoutingInput,
  options: ExtractRoutingAsyncOptions = {}
): Promise<RoutingResult> {
  const result = extractRouting(input, {
    allowHashRouting: options.allowHashRouting,
  });

  if (
    result.destinationBaseAccount === null ||
    result.routingId !== null ||
    result.destinationError !== undefined
  ) {
    return result;
  }

  const lookup: MemoRequirementFetcher =
    options.fetchMemoRequirement ??
    ((accountId) => fetchMemoRequirement(accountId, options));

  let required: boolean;
  try {
    required = await lookup(result.destinationBaseAccount);
  } catch {
    return result;
  }

  if (!required) return result;

  const minSeverity = input.minSeverityLevel ?? "info";
  const warning: Warning = {
    code: "MISSING_REQUIRED_MEMO",
    severity: "error",
    message: MISSING_REQUIRED_MEMO_MESSAGE,
  };

  return {
    ...result,
    warnings:
      SEVERITY_ORDER[warning.severity] >= SEVERITY_ORDER[minSeverity]
        ? [...result.warnings, warning]
        : result.warnings,
  };
}
