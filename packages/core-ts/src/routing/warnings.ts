import type { Warning, WarningCode, WarningSeverity } from "../address/types";

export const WARNING_MESSAGES = {
  INVALID_DESTINATION: "C address is not a valid destination",
  NON_CANONICAL_ADDRESS: "Address normalized to uppercase",
  SANITIZED_HIDDEN_CHARS:
    "Destination was sanitized by removing hidden characters and surrounding whitespace.",
  CONTRACT_SENDER_DETECTED: "Contract source detected. Routing state cleared.",
};

/**
 * Canonical severity for every warning code. Identical tables live in
 * core-go (`address.DefaultSeverity`) and core-dart (`WarningSeverity.forCode`).
 */
export const WARNING_SEVERITY: Readonly<Record<WarningCode, WarningSeverity>> =
  Object.freeze({
    SANITIZED_HIDDEN_CHARS: "info",
    CONTRACT_SENDER_DETECTED: "info",
    MEMO_IGNORED_FOR_MUXED: "info",
    NON_CANONICAL_ADDRESS: "warn",
    NON_CANONICAL_ROUTING_ID: "warn",
    MEMO_PRESENT_WITH_MUXED: "warn",
    MEMO_TEXT_UNROUTABLE: "warn",
    MEMO_ID_INVALID_FORMAT: "warn",
    UNSUPPORTED_MEMO_TYPE: "warn",
    INVALID_DESTINATION: "error",
    MISSING_REQUIRED_MEMO: "error",
  });

const SEVERITY_RANK: Readonly<Record<WarningSeverity, number>> = {
  info: 0,
  warn: 1,
  error: 2,
};

/**
 * Ranks a severity: info (0) < warn (1) < error (2). Unrecognised values rank
 * as info so a filter never silently drops them.
 */
export function severityRank(severity: string | undefined | null): number {
  return severity != null &&
    Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity)
    ? SEVERITY_RANK[severity as WarningSeverity]
    : 0;
}

/**
 * Returns the warnings whose severity is at least `minSeverityLevel`, in their
 * original order. An omitted or unrecognised threshold keeps every warning, so
 * a typo in a strict configuration never hides a warning.
 */
export function filterWarningsBySeverity<W extends Pick<Warning, "severity">>(
  warnings: readonly W[],
  minSeverityLevel?: WarningSeverity | string | null
): W[] {
  const threshold = severityRank(minSeverityLevel);
  if (threshold === 0) return [...warnings];
  return warnings.filter((w) => severityRank(w.severity) >= threshold);
}
