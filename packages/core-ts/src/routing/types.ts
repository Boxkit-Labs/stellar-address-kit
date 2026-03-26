import { Warning } from "../address/types";

export type RoutingSource = "muxed" | "memo" | "none";

export type RoutingInput = {
  destination: string;
  memoType: string;
  memoValue: string | null;
  sourceAccount: string | null;
};

export type KnownMemoType = "none" | "id" | "text" | "hash" | "return";

/**
 * Standardized result for routing operations.
 * Replaces the previous type-based implementation to ensure 
 * consistent handling of 64-bit IDs and warnings.
 */
export interface RoutingResult {
  source: RoutingSource;
  id?: bigint;
  warnings: Warning[];
}

export function routingIdAsBigInt(routingId: string | null): bigint | null {
  return routingId ? BigInt(routingId) : null;
}