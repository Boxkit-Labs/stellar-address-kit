import { RoutingInput, RoutingResult } from "./types";
import { parse } from "../address/parse";
import { decodeMuxed } from "../muxed/decode";
import { normalizeMemoTextId } from "./memo";
import { Warning } from "../address/types";

export function extractRouting(input: RoutingInput): RoutingResult {
  const parsed = parse(input.destination);

  if (parsed.kind === "invalid") {
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: [],
      destinationError: {
        code: parsed.error.code,
        message: parsed.error.message,
      },
    };
  }

  if (parsed.kind === "C") {
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: [
        {
          code: "INVALID_DESTINATION",
          severity: "error",
          message: "C address is not a valid destination",
          context: { destinationKind: "C" },
        },
      ],
    };
  }

  if (parsed.kind === "M") {
    const { baseG, id } = decodeMuxed(parsed.address);
    const warnings: Warning[] = [...parsed.warnings];

    if (
      input.memoType === "id" ||
      (input.memoType === "text" && /^\d+$/.test(input.memoValue ?? ""))
    ) {
      warnings.push({
        code: "MEMO_PRESENT_WITH_MUXED",
        severity: "warn",
        message:
          "Routing ID found in both M-address and Memo. M-address ID takes precedence.",
      });
    } else if (input.memoType !== "none") {
      warnings.push({
        code: "MEMO_IGNORED_FOR_MUXED",
        severity: "info",
        message:
          "Memo present with M-address. Any potential routing ID in memo is ignored.",
      });
    }

    return {
      destinationBaseAccount: baseG,
      routingId: id.toString(),
      routingSource: "muxed",
      warnings,
    };
  }

  let routingId: string | null = null;
  let routingSource: "none" | "memo" = "none";
  const warnings: Warning[] = [...parsed.warnings];

  if (input.memoType === "id") {
    const norm = normalizeMemoTextId(input.memoValue ?? "");
    routingId = norm.normalized;
    routingSource = norm.normalized ? "memo" : "none";
    warnings.push(...norm.warnings);

    if (!norm.normalized) {
      warnings.push({
        code: "MEMO_ID_INVALID_FORMAT",
        severity: "warn",
        message: "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
      });
    }
  } else if (input.memoType === "text" && input.memoValue) {
    const norm = normalizeMemoTextId(input.memoValue);
    if (norm.normalized) {
      routingId = norm.normalized;
      routingSource = "memo";
      warnings.push(...norm.warnings);
    } else {
      warnings.push({
        code: "MEMO_TEXT_UNROUTABLE",
        severity: "warn",
        message: "MEMO_TEXT was not a valid numeric uint64.",
      });
    }
  } else if (input.memoType === "hash" || input.memoType === "return") {
    warnings.push({
      code: "UNSUPPORTED_MEMO_TYPE",
      severity: "warn",
      message: `Memo type ${input.memoType} is not supported for routing.`,
      context: { memoType: input.memoType },
    });
  } else if (input.memoType !== "none") {
    warnings.push({
      code: "UNSUPPORTED_MEMO_TYPE",
      severity: "warn",
      message: `Unrecognized memo type: ${input.memoType}`,
      context: { memoType: "unknown" },
    });
  }

  return {
    destinationBaseAccount: parsed.address,
    routingId,
    routingSource,
    warnings,
  };
}
