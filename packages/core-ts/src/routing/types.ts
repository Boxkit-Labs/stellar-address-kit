import { ErrorCode, Warning, WarningCode } from "../address/types";
export type { Warning, WarningCode } from "../address/types";

export type RoutingSource = "muxed" | "memo" | "none";

export type SeverityLevel = "info" | "warn" | "error";

const SEVERITY_RANK: Record<SeverityLevel, number> = { info: 0, warn: 1, error: 2 };

export function filterBySeverity(warnings: Warning[], min: SeverityLevel): Warning[] {
  const minRank = SEVERITY_RANK[min];
  return warnings.filter((w) => SEVERITY_RANK[w.severity as SeverityLevel] >= minRank);
}

export type RoutingInput = {
  destination: string;
  memoType: string;
  memoValue: string | null;
  sourceAccount: string | null;
  minSeverityLevel?: SeverityLevel;
};

export type KnownMemoType = "none" | "id" | "text" | "hash" | "return";

export type RoutingResult = {
  destinationBaseAccount: string | null;
  routingId: string | bigint | null;
  routingSource: RoutingSource;
  warnings: Warning[]; // WarningCode only, always
  destinationError?: {
    code: ErrorCode;
    message: string;
  };
};

export function routingIdAsBigInt(
  routingId: string | bigint | null
): bigint | null {
  if (routingId === null) {
    return null;
  }

  return typeof routingId === "bigint" ? routingId : BigInt(routingId);
}