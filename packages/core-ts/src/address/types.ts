import { ErrorCode } from "./errors";
export type AddressKind = "G" | "M" | "C";

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

export type Address =
  | {
      kind: "G";
      address: string;
      warnings: Warning[];
    }
  | {
      kind: "M";
      address: string;
      baseG: string;
      muxedId: bigint;
      warnings: Warning[];
    }
  | {
      kind: "C";
      address: string;
      warnings: Warning[];
    };

export type ParseResult =
  | Address
  | {
      kind: "invalid";
      error: {
        code: ErrorCode;
        input: string;
        message: string;
      };
    };

export { ErrorCode } from "./errors";
