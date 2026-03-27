import { RoutingInput, RoutingResult, Warning } from "./types";
import { parse } from "../address/parse";
import { AddressParseError } from "../address/errors";
import { decodeMuxed } from "../muxed/decode";
import { normalizeMemoTextId } from "./memo";

export class ExtractRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractRoutingError";
    Object.setPrototypeOf(this, ExtractRoutingError.prototype);
  }
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

export function extractRouting(input: RoutingInput): RoutingResult {
  assertRoutableAddress(input.destination);

  let parsed;
  try {
    parsed = parse(input.destination);
  } catch (error) {
    if (error instanceof AddressParseError) {
      return {
        destinationBaseAccount: null,
        routingId: null,
        routingSource: "none",
        warnings: [],
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
      source: "none",
      warnings: [],
    };
  }

  if (parsed.kind === "C") {

    const warnings: Warning[] = [...parsed.warnings];

    warnings.push({
      code: "CONTRACT_SENDER_DETECTED",
      severity: "warn",
      message:
        "Contract address detected. Contract addresses cannot be used as transaction senders.",
    });

    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings,
    };

    throw new ExtractRoutingError("Contract addresses cannot be routed");

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
      source: "muxed",
      id,
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
    source: routingSource,
    id: routingId ? BigInt(routingId) : undefined,
    warnings,
  };
}

/**
 * Extracts routing information from a Stellar G-address or M-address.
 *
 * Assignment requirement implemented here:
 *   "When an M-address is provided alongside a conflicting transaction memo,
 *    the memo must be ignored and a 'memo-ignored' warning must be emitted."
 *
 * Built on @stellar/stellar-sdk (StrKey, MuxedAccount).
 * This library will never ship inside the SDK itself – that is the boundary.
 */

import { MuxedAccount, StrKey } from "@stellar/stellar-sdk";
import type { ExtractOptions, RoutingResult } from "../types/index.js";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns `true` when the supplied string begins with the M-address prefix
 * ("M") and passes StrKey validation for a muxed account.
 *
 * We deliberately test the prefix first so we can give a clear, early
 * rejection path before handing off to the SDK decoder (which throws on
 * malformed input).
 */
function isMuxedAddress(address: string): boolean {
  if (!address.startsWith("M")) {
    return false;
  }
  return StrKey.isValidMed25519PublicKey(address);
}

/**
 * Returns `true` for a standard G-address.
 */
function isGAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decodes a Stellar address (G-address **or** M-address) and returns the
 * canonical routing information needed to credit an incoming payment.
 *
 * ### M-address + memo conflict  ← **Assignment requirement**
 *
 * An M-address already encodes the destination account *and* a uint64 memo id
 * in a single string (SEP-0023).  When a caller additionally supplies an
 * `incomingMemo`, those two sources are in conflict.  Per the spec:
 *
 * > "the memo must be ignored and a `'memo-ignored'` warning must be emitted"
 *
 * The returned `RoutingResult` will therefore:
 *  - contain the `memoId` extracted from the M-address itself, and
 *  - include `"memo-ignored"` in its `warnings` array.
 *
 * @param options - See {@link ExtractOptions}
 * @returns       - See {@link RoutingResult}
 * @throws        `Error` when `address` is neither a valid G-address nor a
 *                valid M-address.
 */
export function extractRouting(options: ExtractOptions): RoutingResult {
  const { address, incomingMemo } = options;

  // ── Branch 1: M-address ──────────────────────────────────────────────────
  if (isMuxedAddress(address)) {
    // Decode via the SDK.  MuxedAccount.fromAddress() does the heavy lifting:
    // base32 decode → checksum verify → split into 256-bit Ed25519 key +
    // 64-bit id.  We use .baseAccount() to recover the underlying G-address.
    const muxed = MuxedAccount.fromAddress(address, "0");
    const accountId = muxed.baseAccount().accountId();

    // The uint64 id is returned as a string by the SDK, which correctly
    // preserves values above Number.MAX_SAFE_INTEGER (2^53-1).
    const memoId = muxed.id();

    // Initialise a clean warnings list.
    const warnings: RoutingResult["warnings"] = [];

    // ── ASSIGNMENT REQUIREMENT ──────────────────────────────────────────────
    // After decoding an M-address, check if an incomingMemo was also provided.
    // If so, append a 'memo-ignored' warning to the result's warnings array.
    if (incomingMemo !== undefined && incomingMemo !== null) {
      warnings.push("memo-ignored");
    }
    // ───────────────────────────────────────────────────────────────────────

    return { accountId, memoId, warnings };
  }

  // ── Branch 2: G-address ──────────────────────────────────────────────────
  if (isGAddress(address)) {
    // Plain G-address: no memo embedded, pass incomingMemo through unchanged.
    return {
      accountId: address,
      // memoId is intentionally absent for G-addresses.
      warnings: [],
    };
  }

  // ── Branch 3: Invalid address ────────────────────────────────────────────
  throw new Error(
    `Invalid Stellar address: "${address}". ` +
      `Expected a valid G-address (Ed25519) or M-address (muxed/Med25519).`
  );
}