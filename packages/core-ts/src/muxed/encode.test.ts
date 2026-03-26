// packages/core-ts/src/muxed/encode.test.ts
import { describe, it, expect } from "vitest";
import { encodeMuxed } from "./encode";
import vectors from "../../../../spec/vectors.json";

describe("encodeMuxed", () => {
  // 1. Vector Testing based on actual vectors.json structure
  it("passes all muxed_encode vectors from vectors.json", () => {
    const muxedCases = vectors.cases.filter(
      (c: any) => c.module === "muxed_encode",
    );

    muxedCases.forEach((testCase: any) => {
      const baseG = testCase.input.base_g ?? testCase.input.gAddress;
      const id = testCase.input.id;

      if (testCase.expected.error) {
        expect(() => {
          encodeMuxed(baseG, BigInt(id));
        }).toThrow();
      } else {
        const result = encodeMuxed(baseG, BigInt(id));
        expect(result).toBe(testCase.expected.mAddress);
      }
    });
  });

  // 2. Validation: Invalid G Address
  it("throws if baseG is not a valid G address", () => {
    expect(() => {
      encodeMuxed("INVALID_G_ADDRESS", 123n);
    }).toThrow("Invalid base G address");
  });

  // 3. Validation: Outside uint64 range
  it("throws if id is outside the uint64 range (negative)", () => {
    expect(() => {
      encodeMuxed(
        "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWH4",
        -1n,
      );
    }).toThrow("ID is outside the uint64 range");
  });

  it("throws if id is outside the uint64 range (exceeds max)", () => {
    const MAX_UINT64 = 18446744073709551615n;
    expect(() => {
      encodeMuxed(
        "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWH4",
        MAX_UINT64 + 1n,
      );
    }).toThrow("ID is outside the uint64 range");
  });

  // 4. Validation: Strict Type Checking
  it("throws if id is passed as a number instead of bigint", () => {
    expect(() => {
      encodeMuxed(
        "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWH4",
        123 as any,
      );
    }).toThrow("ID must be a bigint");
  });

  // 5. Boundary Values: Valid edge cases
  it("accepts id=0n (minimum valid uint64)", () => {
    expect(() => {
      encodeMuxed(
        "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI",
        0n,
      );
    }).not.toThrow();
  });

  it("accepts id=MAX_UINT64 (maximum valid uint64)", () => {
    const MAX_UINT64 = 18446744073709551615n;
    expect(() => {
      encodeMuxed(
        "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI",
        MAX_UINT64,
      );
    }).not.toThrow();
  });
});
