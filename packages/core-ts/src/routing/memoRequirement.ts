import type { MemoRequirementFetcher, RoutingInput, RoutingResult } from "./types";
import { extractRouting } from "./extract";

const DEFAULT_HORIZON_URL = "https://horizon.stellar.org";

export type MemoRequirement = {
  required: boolean;
};

function decodeDataValue(value: unknown): boolean {
  if (value === "1" || value === 1 || value === true) return true;
  if (typeof value !== "string") return false;
  try {
    return atob(value) === "1";
  } catch {
    return false;
  }
}

/** Fetches the SEP-0029 memo requirement from a Horizon account response. */
export async function fetchMemoRequirement(
  baseAccount: string,
  fetchImpl: typeof fetch = fetch,
  horizonUrl = DEFAULT_HORIZON_URL
): Promise<boolean> {
  const response = await fetchImpl(
    `${horizonUrl.replace(/\/$/, "")}/accounts/${encodeURIComponent(baseAccount)}`
  );
  if (!response.ok) return false;

  const account = (await response.json()) as { data?: Record<string, unknown> };
  return decodeDataValue(account.data?.["config.memo_required"]) ||
    decodeDataValue(account.data?.["config.requiring_memo"]);
}

/**
 * Performs normal routing extraction and optionally checks SEP-0029 account data.
 * A failed network lookup is treated as unknown and does not block parsing.
 */
export async function extractRoutingAsync(
  input: RoutingInput,
  requirementFetcher: MemoRequirementFetcher = fetchMemoRequirement
): Promise<RoutingResult> {
  const result = extractRouting(input);
  if (!result.destinationBaseAccount || result.routingId !== null || result.destinationError) {
    return result;
  }

  try {
    if (await requirementFetcher(result.destinationBaseAccount)) {
      result.warnings = [
        ...result.warnings,
        {
          code: "MISSING_REQUIRED_MEMO",
          severity: "error",
          message: "Destination account requires a memo, but no routing ID was provided.",
        },
      ];
    }
  } catch {
    // Network/configuration failures must not change the synchronous result.
  }
  return result;
}
