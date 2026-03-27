import { ErrorCode } from "../address/types";

export type RoutingSource = "muxed" | "memo" | "none";

export type RoutingInput = {
  destination: string;
  memoType: string;
  memoValue: string | null;
  sourceAccount: string | null;
};

export type KnownMemoType = "none" | "id" | "text" | "hash" | "return";

export type WarningCode =
  | "NON_CANONICAL_ADDRESS"
  | "NON_CANONICAL_ROUTING_ID"
  | "MEMO_IGNORED_FOR_MUXED"
  | "MEMO_PRESENT_WITH_MUXED"
  | "CONTRACT_SENDER_DETECTED"
  | "MEMO_TEXT_UNROUTABLE"
  | "MEMO_ID_INVALID_FORMAT"
  | "UNSUPPORTED_MEMO_TYPE"
  | "INVALID_DESTINATION";

export type Warning =
  | {
      code: "NON_CANONICAL_ADDRESS" | "NON_CANONICAL_ROUTING_ID";
      severity: "warn";
      message: string;
      normalization: {
        original: string;
        normalized: string;
      };
    }
  | {
      code: "INVALID_DESTINATION";
      severity: "error";
      message: string;
      context: {
        destinationKind: "C";
      };
    }
  | {
      code: "UNSUPPORTED_MEMO_TYPE";
      severity: "warn";
      message: string;
      context: {
        memoType: "hash" | "return" | "unknown";
      };
    }
  | {
      code: Exclude<
        WarningCode,
        | "NON_CANONICAL_ADDRESS"
        | "NON_CANONICAL_ROUTING_ID"
        | "INVALID_DESTINATION"
        | "UNSUPPORTED_MEMO_TYPE"
      >;
      severity: "info" | "warn" | "error";
      message: string;
    };

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