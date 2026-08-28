import { RoutingInput, RoutingResult } from "./types";
import { Warning, WarningSeverity } from "../address/types";
import { parse } from "../address/parse";
import { AddressParseError } from "../address/errors";
import { normalizeMemoTextId } from "./memo";

const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

function filterBySeverity(
  warnings: Warning[],
  minSeverity: WarningSeverity
): Warning[] {
  const threshold = SEVERITY_ORDER[minSeverity];
  return warnings.filter((w) => SEVERITY_ORDER[w.severity] >= threshold);
}

export class ExtractRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractRoutingError";
    Object.setPrototypeOf(this, ExtractRoutingError.prototype);
  }
}

/**
 * Strips non-printable characters, Unicode control/format characters, and whitespace.
 */
function sanitizeDestination(destination: string): {
  sanitized: string;
  wasSanitized: boolean;
} {
  if (!destination || typeof destination !== "string") {
    return { sanitized: destination, wasSanitized: false };
  }
  const sanitized = destination.replace(/[\p{C}\s]/gu, "");
  return {
    sanitized,
    wasSanitized: sanitized !== destination,
  };
}

/**
 * Validates that the destination string passes the minimum structural
 * requirements for a Stellar address before routing logic is applied.
 * Only G-addresses and M-addresses are valid routing targets.
 * Throws ExtractRoutingError for anything that fails this check.
 */
function assertRoutableAddress(destination: string): void {
  if (!destination || typeof destination !== "string") {
    throw new ExtractRoutingError(
      "Invalid input: destination must be a non-empty string."
    );
  }

  const prefix = destination.trim()[0]?.toUpperCase();
  if (prefix !== "G" && prefix !== "M") {
    throw new ExtractRoutingError(
      `Invalid destination: expected a G or M address, got "${destination}".`
    );
  }
}

/**
 * Extracts deposit routing information from a Stellar address and memo.
 * 
 * Routing Policy:
 * 1. M-addresses: Routing ID is extracted from the address; any memo is ignored for routing.
 * 2. G-addresses: Routing ID is extracted from MEMO_ID or numeric MEMO_TEXT if valid.
 * 
 * @param input - The destination address and optional memo components.
 * @returns A result containing the base account, routing ID, source, and any warnings.
 */
export function extractRouting(input: RoutingInput): RoutingResult {
  const { sanitized: destination, wasSanitized } = sanitizeDestination(
    input.destination
  );

  assertRoutableAddress(destination);

  const minSeverity = input.minSeverityLevel ?? "info";
  const sanitizedWarning: Warning | null = wasSanitized
    ? {
        code: "SANITIZED_HIDDEN_CHARS",
        severity: "info",
        message:
          "Destination address contained non-printable characters or whitespace that were stripped.",
      }
    : null;

  const initWarnings = (additional: Warning[] = []): Warning[] => {
    return sanitizedWarning
      ? [sanitizedWarning, ...additional]
      : [...additional];
  };

  let parsed;
  try {
    parsed = parse(destination);
  } catch (error) {
    if (error instanceof AddressParseError) {
      return {
        destinationBaseAccount: null,
        routingId: null,
        routingSource: "none",
        warnings: filterBySeverity(initWarnings(), minSeverity),
        destinationError: {
          code: error.code,
          message: error.message,
        },
      };
    }
    throw error;
  }

  if (parsed.kind === "invalid") {
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: filterBySeverity(initWarnings(), minSeverity),
    };
  }

  if (parsed.kind === "C") {
    const warnings: Warning[] = initWarnings(parsed.warnings);

    warnings.push({
      code: "INVALID_DESTINATION",
      severity: "error",
      message: "C address is not a valid destination",
      context: {
        destinationKind: "C",
      },
    });

    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: filterBySeverity(warnings, minSeverity),
    };
  }

  if (parsed.kind === "M") {
    const warnings: Warning[] = initWarnings(parsed.warnings);

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
      destinationBaseAccount: parsed.baseG,
      routingId: parsed.muxedId,
      routingSource: "muxed",
      warnings: filterBySeverity(warnings, minSeverity),
    };
  }

  let routingId: string | bigint | null = null;
  let routingSource: "none" | "memo" = "none";
  const warnings: Warning[] = initWarnings(parsed.warnings);

  if (input.memoType === "id") {
    const rawValue = input.memoValue ?? "";
    const norm = normalizeMemoTextId(rawValue);

    if (norm.normalized) {
      // Explicit bigint parsing for MEMO_ID to avoid Number precision issues.
      const parsedMemoId = BigInt(norm.normalized);
      routingId = parsedMemoId.toString();
      routingSource = "memo";
      warnings.push(...norm.warnings);
    } else {
      routingSource = "none";
      warnings.push(...norm.warnings);
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
      code: "MEMO_TEXT_UNROUTABLE",
      severity: "warn",
      message: `Memo type ${input.memoType} is not supported for routing.`,
    });
  } else if (input.memoType !== "none") {
    warnings.push({
      code: "MEMO_TEXT_UNROUTABLE",
      severity: "warn",
      message: `Unrecognized memo type: ${input.memoType}`,
    });
  }

  return {
    destinationBaseAccount: parsed.address,
    routingId,
    routingSource,
    warnings: filterBySeverity(warnings, minSeverity),
  };
}