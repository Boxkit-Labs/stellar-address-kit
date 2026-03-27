/** 
 * Shared domain types for stellar-address-kit routing extraction.
 */

// ─── Warning codes ────────────────────────────────────────────────────────────

/**
 * All warning codes that `extractRouting` may emit.
 *
 * | Code            | Meaning                                                  |
 * |-----------------|----------------------------------------------------------|
 * | memo-ignored    | An M-address already encodes a memo id; a separately    |
 * |                 | supplied `incomingMemo` is therefore discarded.          |
 */
export type WarningCode = "memo-ignored";

// ─── Routing result ───────────────────────────────────────────────────────────

/**
 * The decoded routing information returned by `extractRouting`.
 */
export interface RoutingResult {
  /**
   * The base Stellar account G-address (always 56 characters, StrKey encoded).
   */
  accountId: string;

  /**
   * The memo id embedded in the M-address, if present.
   * Encoded as a string to survive the JavaScript 2^53 integer boundary
   * (see SEP-0023 §4 and the 2^53+1 canary vector).
   */
  memoId?: string;

  /**
   * Non-fatal advisory messages produced during decoding.
   * Consumers SHOULD surface these to operators / end-users.
   */
  warnings: WarningCode[];
}

// ─── Input options ────────────────────────────────────────────────────────────

/**
 * Options accepted by `extractRouting`.
 */
export interface ExtractOptions {
  /**
   * A raw Stellar address – either a plain G-address or a muxed M-address.
   */
  address: string;

  /**
   * An optional memo that arrived alongside the payment instruction
   * (e.g. from a transaction memo field or a payment URI parameter).
   *
   * When the `address` is an M-address, this field is **ignored** and a
   * `"memo-ignored"` warning is added to the result.
   */
  incomingMemo?: string;
}