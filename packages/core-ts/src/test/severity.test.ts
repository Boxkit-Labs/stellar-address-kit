/**
 * Warning severity categorisation, minSeverityLevel filtering and structured
 * payloads (issue #357). The same table is asserted in core-go
 * (address/severity_test.go) and core-dart (test/warning_severity_test.dart).
 */
import { describe, it, expect } from "vitest";
import {
  extractRouting,
  parse,
  WARNING_SEVERITY,
  WARNING_SEVERITIES,
  filterWarningsBySeverity,
  severityRank,
} from "../index";
import type { RoutingInput, Warning, WarningSeverity } from "../index";

const G = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";

const CANONICAL: Record<string, WarningSeverity> = {
  SANITIZED_HIDDEN_CHARS: "info",
  CONTRACT_SENDER_DETECTED: "info",
  MEMO_IGNORED_FOR_MUXED: "info",
  NON_CANONICAL_ADDRESS: "warn",
  NON_CANONICAL_ROUTING_ID: "warn",
  MEMO_PRESENT_WITH_MUXED: "warn",
  MEMO_TEXT_UNROUTABLE: "warn",
  MEMO_ID_INVALID_FORMAT: "warn",
  UNSUPPORTED_MEMO_TYPE: "warn",
  INVALID_DESTINATION: "error",
  MISSING_REQUIRED_MEMO: "error",
};

function route(extra: Partial<RoutingInput>) {
  return extractRouting({
    destination: G,
    memoType: "none",
    memoValue: null,
    sourceAccount: null,
    ...extra,
  });
}

describe("WARNING_SEVERITY catalog", () => {
  it("assigns the canonical severity to every warning code", () => {
    expect({ ...WARNING_SEVERITY }).toEqual(CANONICAL);
  });

  it("lists severities in ascending order", () => {
    expect([...WARNING_SEVERITIES]).toEqual(["info", "warn", "error"]);
    expect(WARNING_SEVERITIES.map(severityRank)).toEqual([0, 1, 2]);
  });

  it("ranks unknown severities as info", () => {
    expect(severityRank("fatal")).toBe(0);
    expect(severityRank(undefined)).toBe(0);
  });
});

describe("filterWarningsBySeverity", () => {
  const ws = [
    { severity: "info" as const, code: "a" },
    { severity: "error" as const, code: "b" },
    { severity: "warn" as const, code: "c" },
  ];

  it.each([
    ["info", ["a", "b", "c"]],
    ["warn", ["b", "c"]],
    ["error", ["b"]],
    [undefined, ["a", "b", "c"]],
    ["bogus", ["a", "b", "c"]],
  ])("min %s keeps %j in order", (min, codes) => {
    expect(filterWarningsBySeverity(ws, min as string).map((w) => w.code)).toEqual(codes);
  });

  it("does not mutate its input", () => {
    filterWarningsBySeverity(ws, "error");
    expect(ws).toHaveLength(3);
  });
});

describe("emitted warnings carry the catalog severity", () => {
  const cases: Array<[string, Partial<RoutingInput>]> = [
    ["SANITIZED_HIDDEN_CHARS", { destination: ` ${G}\u200b` }],
    ["NON_CANONICAL_ADDRESS", { destination: G.toLowerCase() }],
    ["NON_CANONICAL_ROUTING_ID", { memoType: "id", memoValue: "007" }],
    ["MEMO_ID_INVALID_FORMAT", { memoType: "id", memoValue: "abc" }],
    ["MEMO_TEXT_UNROUTABLE", { memoType: "text", memoValue: "hello" }],
    ["UNSUPPORTED_MEMO_TYPE", { memoType: "hash", memoValue: "ab" }],
  ];

  it.each(cases)("%s", (code, extra) => {
    const w = route(extra).warnings.find((x: Warning) => x.code === code);
    expect(w).toBeDefined();
    expect(w!.severity).toBe(CANONICAL[code]);
  });
});

describe("minSeverityLevel on extractRouting", () => {
  // Produces one info (SANITIZED_HIDDEN_CHARS) and two warn warnings
  // (NON_CANONICAL_ADDRESS, NON_CANONICAL_ROUTING_ID).
  const noisy: Partial<RoutingInput> = {
    destination: ` ${G.toLowerCase()} `,
    memoType: "id",
    memoValue: "0042",
  };

  it("defaults to info and returns everything", () => {
    expect(route(noisy).warnings.map((w) => w.code)).toEqual([
      "SANITIZED_HIDDEN_CHARS",
      "NON_CANONICAL_ADDRESS",
      "NON_CANONICAL_ROUTING_ID",
    ]);
  });

  it("warn drops info only", () => {
    expect(
      route({ ...noisy, minSeverityLevel: "warn" }).warnings.map((w) => w.code)
    ).toEqual(["NON_CANONICAL_ADDRESS", "NON_CANONICAL_ROUTING_ID"]);
  });

  it("error drops info and warn but never changes routing", () => {
    const r = route({ ...noisy, minSeverityLevel: "error" });
    expect(r.warnings).toEqual([]);
    expect(r.routingId).toBe("42");
    expect(r.routingSource).toBe("memo");
    expect(r.destinationBaseAccount).toBe(G);
  });
});

describe("structured payloads", () => {
  it("NON_CANONICAL_ADDRESS from parse carries { original, normalized }", () => {
    const parsed = parse(G.toLowerCase());
    expect(parsed.kind).toBe("G");
    if (parsed.kind === "invalid") throw new Error("unexpected");
    expect(parsed.warnings).toEqual([
      {
        code: "NON_CANONICAL_ADDRESS",
        severity: "warn",
        message: "Address normalized to uppercase",
        normalization: { original: G.toLowerCase(), normalized: G },
      },
    ]);
  });

  it("canonical input produces no NON_CANONICAL_ADDRESS", () => {
    const parsed = parse(G);
    if (parsed.kind === "invalid") throw new Error("unexpected");
    expect(parsed.warnings).toEqual([]);
  });

  it("NON_CANONICAL_ROUTING_ID carries { original, normalized }", () => {
    const w = route({ memoType: "id", memoValue: "007" }).warnings[0];
    expect(w).toEqual({
      code: "NON_CANONICAL_ROUTING_ID",
      severity: "warn",
      message: expect.any(String),
      normalization: { original: "007", normalized: "7" },
    });
  });

  it.each([
    ["hash", "hash"],
    ["return", "return"],
    ["MEMO_FOO", "unknown"],
  ])("UNSUPPORTED_MEMO_TYPE for %s reports context.memoType %s", (memoType, ctx) => {
    const w = route({ memoType, memoValue: "x" }).warnings[0];
    expect(w).toMatchObject({
      code: "UNSUPPORTED_MEMO_TYPE",
      severity: "warn",
      context: { memoType: ctx },
    });
  });
});
