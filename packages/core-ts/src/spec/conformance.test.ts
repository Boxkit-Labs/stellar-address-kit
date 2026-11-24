import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { vectors as packagedVectors } from "@stellar-address-kit/spec";
import { detect, encodeMuxed, decodeMuxed, extractRouting } from "../index";

/**
 * Cross-platform conformance checks that sit on top of runner.test.ts.
 *
 * runner.test.ts replays every vector; this file guards the things a replay
 * cannot notice on its own: that it is replaying the *canonical* vectors, that
 * no vector module is silently skipped, that the 2^53+1 canary survives, and
 * that the canonicalization invariants hold for every routing result.
 */

const SPEC_DIR = path.resolve(__dirname, "../../../../spec");
const VECTORS_PATH = path.join(SPEC_DIR, "vectors.json");
const RAW = fs.readFileSync(VECTORS_PATH, "utf8");
const canonical = JSON.parse(RAW) as { spec_version: string; cases: any[] };

const KNOWN_MODULES = ["detect", "muxed_encode", "muxed_decode", "extract_routing"];

const CANARY = "9007199254740993"; // 2^53 + 1
const MAX_UINT64 = "18446744073709551615";
const VALID_G = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";

const CANONICAL_ROUTING_ID = /^(0|[1-9][0-9]*)$/;

const routingCases = canonical.cases.filter((c) => c.module === "extract_routing");

describe("spec vectors: source of truth", () => {
  it("packages/spec ships exactly the vectors in spec/vectors.json", () => {
    expect(packagedVectors).toEqual(canonical);
  });

  it("packages/spec/vectors.json has the same text as spec/vectors.json", () => {
    // Line endings are normalized because a checkout may convert them.
    const packaged = fs.readFileSync(
      path.resolve(SPEC_DIR, "../packages/spec/vectors.json"),
      "utf8"
    );
    expect(packaged.replace(/\r\n/g, "\n")).toBe(RAW.replace(/\r\n/g, "\n"));
  });

  it("every vector uses a module this harness knows how to run", () => {
    const unknown = canonical.cases
      .map((c) => c.module)
      .filter((m) => !KNOWN_MODULES.includes(m));
    expect(unknown).toEqual([]);
  });

  it("every known module has at least one vector", () => {
    for (const module of KNOWN_MODULES) {
      expect(
        canonical.cases.some((c) => c.module === module),
        `no vector for module ${module}`
      ).toBe(true);
    }
  });

  it("the suite covers positive, negative and edge-case vectors", () => {
    const tags = new Set(canonical.cases.flatMap((c) => c.tags ?? []));
    for (const tag of ["positive", "negative", "edge"]) {
      expect(tags.has(tag), `no vector tagged ${tag}`).toBe(true);
    }
  });

  it("writes every 64-bit id as a JSON string, never a number", () => {
    // A bare number in the file would already have lost precision when any
    // JSON parser read it into a float64.
    expect(RAW).not.toMatch(/"(id|routingId)"\s*:\s*-?\d/);
  });
});

describe("2^53+1 canary (id 9007199254740993)", () => {
  it("is present in the encode, decode and routing vectors", () => {
    const modules = new Set(
      canonical.cases
        .filter((c) => JSON.stringify(c).includes(`"${CANARY}"`))
        .map((c) => c.module)
    );
    expect([...modules].sort()).toEqual(
      ["extract_routing", "muxed_decode", "muxed_encode"].sort()
    );
  });

  it("is not representable as a float64, so a Number would corrupt it", () => {
    expect(String(Number(CANARY))).not.toBe(CANARY);
    expect(BigInt(Number(CANARY))).toBe(9007199254740992n);
  });

  it("encodes and decodes without precision loss", () => {
    const encoded = encodeMuxed(VALID_G, BigInt(CANARY));
    const decoded = decodeMuxed(encoded);
    expect(typeof decoded.id).toBe("bigint");
    expect(decoded.id.toString()).toBe(CANARY);
    expect(decoded.id).not.toBe(BigInt(Number(CANARY)));
    expect(decoded.baseG).toBe(VALID_G);
  });

  it("keeps the canary distinct from its float64 neighbour", () => {
    const canaryAddress = encodeMuxed(VALID_G, BigInt(CANARY));
    const neighbourAddress = encodeMuxed(VALID_G, BigInt(CANARY) - 1n);
    expect(canaryAddress).not.toBe(neighbourAddress);
    expect(decodeMuxed(neighbourAddress).id.toString()).toBe("9007199254740992");
  });

  it("round-trips the largest uint64", () => {
    const encoded = encodeMuxed(VALID_G, BigInt(MAX_UINT64));
    expect(decodeMuxed(encoded).id.toString()).toBe(MAX_UINT64);
  });

  it("returns the canary as an exact decimal string from a MEMO_ID", () => {
    const result = extractRouting({
      destination: VALID_G,
      memoType: "id",
      memoValue: CANARY,
      sourceAccount: null,
    });
    expect(String(result.routingId)).toBe(CANARY);
    expect(result.routingSource).toBe("memo");
    expect(result.warnings).toEqual([]);
  });

  it("returns the canary as an exact decimal string from a muxed address", () => {
    const result = extractRouting({
      destination: encodeMuxed(VALID_G, BigInt(CANARY)),
      memoType: "none",
      memoValue: null,
      sourceAccount: null,
    });
    expect(String(result.routingId)).toBe(CANARY);
    expect(result.routingSource).toBe("muxed");
  });
});

describe("canonicalization invariants hold for every routing vector", () => {
  it("has routing vectors to check", () => {
    expect(routingCases.length).toBeGreaterThan(0);
  });

  for (const c of routingCases) {
    it(`[extract_routing] ${c.description}`, () => {
      // The vectors store placeholder addresses that the runner swaps for
      // real ones, so check the expected block here and the live result in
      // runner.test.ts; both must satisfy the same invariants.
      const { destinationBaseAccount, routingId } = c.expected;

      if (destinationBaseAccount !== null) {
        expect(destinationBaseAccount).toBe(destinationBaseAccount.toUpperCase());
      }
      if (routingId !== null) {
        expect(typeof routingId).toBe("string");
        expect(routingId).toMatch(CANONICAL_ROUTING_ID);
      }
    });
  }

  it("uppercases a lowercase base account and strips leading zeros live", () => {
    const upper = extractRouting({
      destination: VALID_G.toLowerCase(),
      memoType: "id",
      memoValue: "0007",
      sourceAccount: null,
    });
    expect(upper.destinationBaseAccount).toBe(VALID_G);
    expect(String(upper.routingId)).toBe("7");
    expect(upper.warnings.map((w) => w.code)).toContain("NON_CANONICAL_ROUTING_ID");
  });

  it("keeps a lone zero as '0' without a leading-zero warning", () => {
    const result = extractRouting({
      destination: VALID_G,
      memoType: "id",
      memoValue: "0",
      sourceAccount: null,
    });
    expect(String(result.routingId)).toBe("0");
    expect(result.warnings.map((w) => w.code)).not.toContain(
      "NON_CANONICAL_ROUTING_ID"
    );
  });

  it("returns uppercase output for a lowercase detect vector", () => {
    const lower = VALID_G.toLowerCase();
    expect(detect(lower)).toBe("G");
    expect(extractRouting({
      destination: lower,
      memoType: "none",
      memoValue: null,
      sourceAccount: null,
    }).destinationBaseAccount).toBe(VALID_G);
  });
});
