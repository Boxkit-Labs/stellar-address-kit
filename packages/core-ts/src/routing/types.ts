import { ErrorCode } from "../address/types";

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

export type RoutingResult = {
  destinationBaseAccount: string | null;
  routingId: string | null; // decimal uint64 string — spec level
  routingSource: "muxed" | "memo" | "none";
  warnings: Warning[]; // WarningCode only, always
  destinationError?: {
    // ErrorCode only, when destination unparseable
    code: ErrorCode;
    message: string;
  };
};

/**
 * Ergonomic helper for TypeScript callers to get a BigInt from the routingId string.
 */
export function routingIdAsBigInt(routingId: string | null): bigint | null {
  return routingId ? BigInt(routingId) : null;
}
