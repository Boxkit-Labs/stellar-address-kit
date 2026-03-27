/**
 * Test suite for extractRouting() – covering the assignment requirement:
 *
 *   "When an M-address is provided alongside a conflicting transaction memo,
 *    the memo must be ignored and a 'memo-ignored' warning must be emitted."
 *
 * Test categories
 * ───────────────
 *  1. M-address WITHOUT incomingMemo  → no warnings
 *  2. M-address WITH    incomingMemo  → 'memo-ignored' warning  ← ASSIGNMENT
 *  3. G-address without memo          → passes through cleanly
 *  4. G-address with memo             → no warning (memo conflict only applies to M-addresses)
 *  5. High-id canary (id > 2^53)      → memoId string is preserved exactly
 *  6. Invalid address                 → throws
 */

import { MuxedAccount, Keypair } from "@stellar/stellar-sdk";
import { extractRouting } from "../src/routing/extract";
import type { RoutingResult } from "../src/types/index";

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Deterministic G-address generated from a known seed so the test suite is
// reproducible without network access.
const SEED_KEYPAIR = Keypair.fromSecret(
  "SAWAIYNFPJI74KRGDL27V7GVMZ4WSTQRCWL6C67MAVXXVWU33MAE3PAD"
);
const G_ADDRESS = SEED_KEYPAIR.publicKey(); // "GCKUD4IIA..."

/**
 * Build an M-address from the test G-address and a given uint64 id (as string
 * to survive values > Number.MAX_SAFE_INTEGER).
 */
function buildMAddress(id: string): string {
  const muxed = new MuxedAccount(
    /* baseAccount */ { accountId: () => G_ADDRESS } as any,
    id
  );
  // MuxedAccount.accountId() returns the M-address string.
  return muxed.accountId();
}

const MEMO_ID = "42";
const M_ADDRESS = buildMAddress(MEMO_ID);

// SEP-0023 §4 canary: first integer that cannot be represented as a JS float64
// without loss.  id = 2^53 + 1 = 9007199254740993.
const CANARY_ID = "9007199254740993";
const M_ADDRESS_CANARY = buildMAddress(CANARY_ID);

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("extractRouting()", () => {
  // ── 1. M-address alone (no incoming memo) ─────────────────────────────────
  describe("M-address without incomingMemo", () => {
    let result: RoutingResult;

    beforeEach(() => {
      result = extractRouting({ address: M_ADDRESS });
    });

    it("resolves the correct base G-address", () => {
      expect(result.accountId).toBe(G_ADDRESS);
    });

    it("extracts the correct memoId from the M-address", () => {
      expect(result.memoId).toBe(MEMO_ID);
    });

    it("emits NO warnings when no incomingMemo is supplied", () => {
      expect(result.warnings).toHaveLength(0);
    });
  });

  // ── 2. ASSIGNMENT REQUIREMENT: M-address WITH conflicting memo ────────────
  describe("M-address WITH incomingMemo (assignment requirement)", () => {
    const CONFLICTING_MEMO = "99999";
    let result: RoutingResult;

    beforeEach(() => {
      result = extractRouting({
        address: M_ADDRESS,
        incomingMemo: CONFLICTING_MEMO,
      });
    });

    it("resolves the correct base G-address", () => {
      expect(result.accountId).toBe(G_ADDRESS);
    });

    it("uses the memoId from the M-address, not the incomingMemo", () => {
      // The M-address encodes MEMO_ID ("42"); CONFLICTING_MEMO ("99999")
      // must NOT appear in the result.
      expect(result.memoId).toBe(MEMO_ID);
      expect(result.memoId).not.toBe(CONFLICTING_MEMO);
    });

    it('emits exactly one "memo-ignored" warning', () => {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toBe("memo-ignored");
    });

    it("does not include the conflicting memo anywhere in the result", () => {
      // Belt-and-braces: make sure the raw conflict value leaked nowhere.
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(CONFLICTING_MEMO);
    });
  });

  // ── 3. G-address without memo ─────────────────────────────────────────────
  describe("G-address without incomingMemo", () => {
    let result: RoutingResult;

    beforeEach(() => {
      result = extractRouting({ address: G_ADDRESS });
    });

    it("returns the G-address unchanged as accountId", () => {
      expect(result.accountId).toBe(G_ADDRESS);
    });

    it("does not set memoId", () => {
      expect(result.memoId).toBeUndefined();
    });

    it("emits no warnings", () => {
      expect(result.warnings).toHaveLength(0);
    });
  });

  // ── 4. G-address WITH a memo (no conflict warning expected) ───────────────
  describe("G-address WITH incomingMemo (no warning – conflict rule only applies to M-addresses)", () => {
    let result: RoutingResult;

    beforeEach(() => {
      result = extractRouting({ address: G_ADDRESS, incomingMemo: "123" });
    });

    it("returns the G-address unchanged as accountId", () => {
      expect(result.accountId).toBe(G_ADDRESS);
    });

    it("does NOT emit memo-ignored for a G-address", () => {
      expect(result.warnings).not.toContain("memo-ignored");
    });
  });

  // ── 5. Canary: M-address with id > 2^53 (uint64 boundary) ─────────────────
  describe("M-address with id > 2^53 (SEP-0023 canary vector)", () => {
    let result: RoutingResult;

    beforeEach(() => {
      result = extractRouting({ address: M_ADDRESS_CANARY });
    });

    it("preserves the full uint64 id as a string without truncation", () => {
      expect(result.memoId).toBe(CANARY_ID);
    });

    it("the id is NOT equal to the truncated float64 representation", () => {
      // 2^53 + 1 as a JS number collapses to 2^53 (9007199254740992).
      const truncated = (Number(CANARY_ID)).toString();
      expect(result.memoId).not.toBe(truncated);
    });
  });

  // ── 5b. Canary WITH conflicting memo: warning still fires ─────────────────
  describe("M-address (canary id) WITH incomingMemo", () => {
    it('still emits "memo-ignored" for a high-id M-address + conflicting memo', () => {
      const result = extractRouting({
        address: M_ADDRESS_CANARY,
        incomingMemo: "1",
      });
      expect(result.warnings).toContain("memo-ignored");
      expect(result.memoId).toBe(CANARY_ID);
    });
  });

  // ── 6. Invalid address ────────────────────────────────────────────────────
  describe("Invalid address", () => {
    it("throws for a random string", () => {
      expect(() =>
        extractRouting({ address: "not-a-stellar-address" })
      ).toThrow(/Invalid Stellar address/);
    });

    it("throws for an empty string", () => {
      expect(() => extractRouting({ address: "" })).toThrow(
        /Invalid Stellar address/
      );
    });

    it("throws for a truncated M-address", () => {
      expect(() =>
        extractRouting({ address: M_ADDRESS.slice(0, 20) })
      ).toThrow();
    });
  });
});