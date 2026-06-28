/**
 * extractRouting() – structured Warning diagnostics test suite
 *
 * The Warning interface emits typed objects ({ code, severity, message })
 * rather than plain strings. This suite validates that each warning branch
 * in extract.ts injects the correct schema.
 *
 * Test categories
 * ───────────────
 *  1. MEMO_PRESENT_WITH_MUXED   – M-address + numeric memo-id conflict
 *  2. MEMO_IGNORED_FOR_MUXED    – M-address + non-routable memo type
 *  3. CONTRACT_SENDER_DETECTED  – C-address is rejected at the routing guard
 *  4. MEMO_ID_INVALID_FORMAT    – G-address + empty / non-numeric memo-id
 *  5. MEMO_TEXT_UNROUTABLE      – G-address + unsupported memo type (hash)
 *  6. NON_CANONICAL_ROUTING_ID  – G-address + leading-zero memo-id
 *  7. Multi-warning              – leading-zero memo-id that exceeds uint64 max
 *                                  triggers NON_CANONICAL_ROUTING_ID +
 *                                  MEMO_ID_INVALID_FORMAT simultaneously
 */

import { describe, it, expect, beforeEach } from "vitest";
import { encodeMuxed } from "../muxed/encode";
import { extractRouting, ExtractRoutingError } from "../routing/extract";
import type { RoutingInput, RoutingResult, Warning } from "../routing/types";

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Well-known G-address from spec/vectors.json (muxed_encode cases).
const G_ADDRESS = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const ROUTING_ID = 42n;
const M_ADDRESS = encodeMuxed(G_ADDRESS, ROUTING_ID);

// Helper: build a complete RoutingInput with sensible defaults.
function input(
  destination: string,
  memoType = "none",
  memoValue: string | null = null
): RoutingInput {
  return { destination, memoType, memoValue, sourceAccount: null };
}

// ─── 1. MEMO_PRESENT_WITH_MUXED ───────────────────────────────────────────────

describe("MEMO_PRESENT_WITH_MUXED warning", () => {
  let result: RoutingResult;

  // Trigger: M-address destination + numeric memo-id supplied simultaneously.
  beforeEach(() => {
    result = extractRouting(input(M_ADDRESS, "id", "99999"));
  });

  it("emits exactly one warning", () => {
    expect(result.warnings).toHaveLength(1);
  });

  it("warning.code is MEMO_PRESENT_WITH_MUXED", () => {
    expect(result.warnings[0].code).toBe("MEMO_PRESENT_WITH_MUXED");
  });

  it("warning.severity is 'warn'", () => {
    expect(result.warnings[0].severity).toBe("warn");
  });

  it("warning.message is a non-empty string", () => {
    expect(typeof result.warnings[0].message).toBe("string");
    expect(result.warnings[0].message.length).toBeGreaterThan(0);
  });

  it("routing still resolves from the M-address (source is 'muxed')", () => {
    expect(result.routingSource).toBe("muxed");
    expect(result.destinationBaseAccount).toBe(G_ADDRESS);
  });
});

// ─── 2. MEMO_IGNORED_FOR_MUXED ────────────────────────────────────────────────

describe("MEMO_IGNORED_FOR_MUXED warning", () => {
  let result: RoutingResult;

  // Trigger: M-address destination + a non-numeric text memo.
  beforeEach(() => {
    result = extractRouting(input(M_ADDRESS, "text", "order-ref-abc"));
  });

  it("emits exactly one warning", () => {
    expect(result.warnings).toHaveLength(1);
  });

  it("warning.code is MEMO_IGNORED_FOR_MUXED", () => {
    expect(result.warnings[0].code).toBe("MEMO_IGNORED_FOR_MUXED");
  });

  it("warning.severity is 'info'", () => {
    expect(result.warnings[0].severity).toBe("info");
  });

  it("warning.message is a non-empty string", () => {
    expect(typeof result.warnings[0].message).toBe("string");
    expect(result.warnings[0].message.length).toBeGreaterThan(0);
  });

  it("routing ID still comes from the M-address", () => {
    expect(result.routingSource).toBe("muxed");
    expect(result.destinationBaseAccount).toBe(G_ADDRESS);
  });
});

// ─── 3. CONTRACT_SENDER_DETECTED ─────────────────────────────────────────────
//
// C-addresses are rejected by assertRoutableAddress() before reaching the
// parsed.kind === "C" branch, so extractRouting throws ExtractRoutingError
// rather than returning a CONTRACT_SENDER_DETECTED warning object.
// This test documents that gate behaviour.

describe("CONTRACT_SENDER_DETECTED – C-address routing guard", () => {
  // A well-formed Stellar contract address (C-prefix).
  const C_ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  it("throws ExtractRoutingError for a contract address", () => {
    expect(() => extractRouting(input(C_ADDRESS))).toThrow(ExtractRoutingError);
  });

  it("error message identifies the invalid destination prefix", () => {
    expect(() => extractRouting(input(C_ADDRESS))).toThrow(
      /expected a G or M address/
    );
  });

  it("does NOT return a result object – no silent failure", () => {
    let result: RoutingResult | undefined;
    try {
      result = extractRouting(input(C_ADDRESS));
    } catch {
      // expected
    }
    expect(result).toBeUndefined();
  });
});

// ─── 4. MEMO_ID_INVALID_FORMAT ────────────────────────────────────────────────

describe("MEMO_ID_INVALID_FORMAT warning", () => {
  it("emits MEMO_ID_INVALID_FORMAT for an empty memo-id value", () => {
    const result = extractRouting(input(G_ADDRESS, "id", ""));
    const codes = result.warnings.map((w: Warning) => w.code);
    expect(codes).toContain("MEMO_ID_INVALID_FORMAT");
  });

  it("warning object has severity 'warn'", () => {
    const result = extractRouting(input(G_ADDRESS, "id", ""));
    const warning = result.warnings.find(
      (w: Warning) => w.code === "MEMO_ID_INVALID_FORMAT"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warn");
    expect(typeof warning!.message).toBe("string");
  });

  it("emits MEMO_ID_INVALID_FORMAT for a non-numeric memo-id", () => {
    const result = extractRouting(input(G_ADDRESS, "id", "not-a-number"));
    const codes = result.warnings.map((w: Warning) => w.code);
    expect(codes).toContain("MEMO_ID_INVALID_FORMAT");
  });

  it("routing source falls back to 'none' when memo-id is invalid", () => {
    const result = extractRouting(input(G_ADDRESS, "id", ""));
    expect(result.routingSource).toBe("none");
    expect(result.routingId).toBeNull();
  });
});

// ─── 5. MEMO_TEXT_UNROUTABLE ──────────────────────────────────────────────────

describe("MEMO_TEXT_UNROUTABLE warning", () => {
  it("emits MEMO_TEXT_UNROUTABLE for memoType 'hash'", () => {
    const result = extractRouting(input(G_ADDRESS, "hash", "abc123"));
    const codes = result.warnings.map((w: Warning) => w.code);
    expect(codes).toContain("MEMO_TEXT_UNROUTABLE");
  });

  it("emits MEMO_TEXT_UNROUTABLE for memoType 'return'", () => {
    const result = extractRouting(input(G_ADDRESS, "return", "abc123"));
    const codes = result.warnings.map((w: Warning) => w.code);
    expect(codes).toContain("MEMO_TEXT_UNROUTABLE");
  });

  it("warning object has severity 'warn' and a non-empty message", () => {
    const result = extractRouting(input(G_ADDRESS, "hash", "abc123"));
    const warning = result.warnings.find(
      (w: Warning) => w.code === "MEMO_TEXT_UNROUTABLE"
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warn");
    expect(warning!.message.length).toBeGreaterThan(0);
  });
});

// ─── 6. NON_CANONICAL_ROUTING_ID ─────────────────────────────────────────────

describe("NON_CANONICAL_ROUTING_ID warning", () => {
  // Trigger: G-address + memoType "id" with leading zeros (e.g. "007").
  let result: RoutingResult;

  beforeEach(() => {
    result = extractRouting(input(G_ADDRESS, "id", "007"));
  });

  it("emits exactly one warning", () => {
    expect(result.warnings).toHaveLength(1);
  });

  it("warning.code is NON_CANONICAL_ROUTING_ID", () => {
    expect(result.warnings[0].code).toBe("NON_CANONICAL_ROUTING_ID");
  });

  it("warning.severity is 'warn'", () => {
    expect(result.warnings[0].severity).toBe("warn");
  });

  it("warning carries normalization metadata with original and normalized values", () => {
    const w = result.warnings[0] as Extract<Warning, { normalization: unknown }>;
    expect(w.normalization.original).toBe("007");
    expect(w.normalization.normalized).toBe("7");
  });

  it("routingId is normalized to the canonical decimal form", () => {
    expect(result.routingId).toBe("7");
    expect(result.routingSource).toBe("memo");
  });
});

// ─── 7. Multi-warning: NON_CANONICAL_ROUTING_ID + MEMO_ID_INVALID_FORMAT ─────
//
// A memo-id value with leading zeros that also exceeds UINT64_MAX triggers
// TWO warnings at once:
//   1. NON_CANONICAL_ROUTING_ID  (from normalizeMemoTextId stripping leading zero)
//   2. MEMO_ID_INVALID_FORMAT    (because the stripped value exceeds uint64 max)

describe("multi-warning: NON_CANONICAL_ROUTING_ID + MEMO_ID_INVALID_FORMAT", () => {
  // "018446744073709551616" = leading zero + value one above UINT64_MAX
  const OVERFLOW_WITH_LEADING_ZERO = "018446744073709551616";
  let result: RoutingResult;

  beforeEach(() => {
    result = extractRouting(input(G_ADDRESS, "id", OVERFLOW_WITH_LEADING_ZERO));
  });

  it("emits exactly two warnings", () => {
    expect(result.warnings).toHaveLength(2);
  });

  it("first warning is NON_CANONICAL_ROUTING_ID", () => {
    expect(result.warnings[0].code).toBe("NON_CANONICAL_ROUTING_ID");
  });

  it("second warning is MEMO_ID_INVALID_FORMAT", () => {
    expect(result.warnings[1].code).toBe("MEMO_ID_INVALID_FORMAT");
  });

  it("both warnings have severity 'warn'", () => {
    for (const w of result.warnings) {
      expect(w.severity).toBe("warn");
    }
  });

  it("NON_CANONICAL_ROUTING_ID normalization metadata is correct", () => {
    const w = result.warnings[0] as Extract<Warning, { normalization: unknown }>;
    expect(w.normalization.original).toBe(OVERFLOW_WITH_LEADING_ZERO);
    expect(w.normalization.normalized).toBe("18446744073709551616");
  });

  it("routing falls back to 'none' because the value exceeds uint64 max", () => {
    expect(result.routingSource).toBe("none");
    expect(result.routingId).toBeNull();
  });

  it("all warning objects carry a non-empty message string", () => {
    for (const w of result.warnings) {
      expect(typeof w.message).toBe("string");
      expect(w.message.length).toBeGreaterThan(0);
    }
  });
});

describe("SEP-0029 memo requirement", () => {
  it("appends MISSING_REQUIRED_MEMO when a required G-address memo is absent", async () => {
    const { extractRoutingWithMemoRequirement } = await import("../routing/memoRequirement");
    const result = await extractRoutingWithMemoRequirement(input(G_ADDRESS), async () => ({
      requiringMemo: true,
    }));

    expect(result.warnings.at(-1)?.code).toBe("MISSING_REQUIRED_MEMO");
    expect(result.warnings.at(-1)?.severity).toBe("error");
  });

  it("does not append MISSING_REQUIRED_MEMO when a routing ID is present", async () => {
    const { extractRoutingWithMemoRequirement } = await import("../routing/memoRequirement");
    const result = await extractRoutingWithMemoRequirement(input(G_ADDRESS, "id", "123"), async () => ({
      requiringMemo: true,
    }));

    expect(result.warnings.map((warning) => warning.code)).not.toContain("MISSING_REQUIRED_MEMO");
  });
});
