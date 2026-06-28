import { Warning } from "../address/types";
import { RoutingInput, RoutingResult } from "./types";
import { extractRouting } from "./extract";

export type MemoRequirement = {
  requiringMemo: boolean;
};

export type MemoRequirementFetcher = (
  baseAccount: string
) => Promise<MemoRequirement | null>;

function decodeBase64(value: string): string {
  return atob(value);
}

function parseMemoRequirementValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  const decoded = (() => {
    try {
      return decodeBase64(value).trim();
    } catch {
      return value.trim();
    }
  })();

  if (decoded === "true" || decoded === "1") return true;
  if (decoded === "false" || decoded === "0" || decoded === "") return false;

  try {
    const json = JSON.parse(decoded);
    return json === true || json?.requiring_memo === true;
  } catch {
    return false;
  }
}

/**
 * Fetches SEP-0029 memo requirement configuration from a Horizon account.
 *
 * The helper is optional by design: callers provide a Horizon URL when they want
 * network-backed checks, and pass the result to `applyMemoRequirement`.
 */
export async function fetchMemoRequirement(
  baseAccount: string,
  horizonUrl = "https://horizon.stellar.org"
): Promise<MemoRequirement> {
  const response = await fetch(
    `${horizonUrl.replace(/\/$/, "")}/accounts/${encodeURIComponent(baseAccount)}`
  );

  if (!response.ok) {
    throw new Error(`Unable to fetch SEP-0029 memo requirement: ${response.status}`);
  }

  const account = await response.json();
  const attrs = account?.data_attr ?? {};
  const value = attrs["config.requiring_memo"] ?? attrs["config.memo_required"];

  return { requiringMemo: parseMemoRequirementValue(value) };
}

export function applyMemoRequirement(
  result: RoutingResult,
  requirement: MemoRequirement | null | undefined
): RoutingResult {
  if (!requirement?.requiringMemo || result.routingId !== null) {
    return result;
  }

  const warning: Warning = {
    code: "MISSING_REQUIRED_MEMO",
    severity: "error",
    message:
      "Destination account requires a memo/routing ID under SEP-0029, but none was provided.",
  };

  return {
    ...result,
    warnings: [...result.warnings, warning],
  };
}

export async function extractRoutingWithMemoRequirement(
  input: RoutingInput,
  fetcher: MemoRequirementFetcher = fetchMemoRequirement
): Promise<RoutingResult> {
  const result = extractRouting(input);

  if (!result.destinationBaseAccount) return result;

  const requirement = await fetcher(result.destinationBaseAccount);
  return applyMemoRequirement(result, requirement);
}
