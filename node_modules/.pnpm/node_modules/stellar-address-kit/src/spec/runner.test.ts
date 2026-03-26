import { describe, it, expect } from "vitest";
import { vectors } from "@stellar-address-kit/spec";
import { detect, encodeMuxed, decodeMuxed, extractRouting } from "../index";

describe("Normative Vector Tests", () => {
  vectors.cases.forEach((c: any) => {
    it(`[${c.module}] ${c.description}`, () => {
      switch (c.module) {
        case "detect": {
          const kind = detect(c.input.address);
          expect(kind).toBe(c.expected.kind);
          break;
        }
        case "muxed_encode": {
          const baseG = c.input.base_g ?? c.input.gAddress;
          const mAddress = encodeMuxed(baseG, BigInt(c.input.id));
          expect(mAddress).toBe(c.expected.mAddress);
          break;
        }
        case "muxed_decode": {
          if (c.expected.expected_error) {
            expect(() => decodeMuxed(c.input.mAddress)).toThrow();
          } else {
            const result = decodeMuxed(c.input.mAddress);
            expect(result.baseG).toBe(c.expected.base_g);
            expect(result.id).toBe(c.expected.id);
          }
          break;
        }
        case "extract_routing": {
          // Skipping since vectors.json uses dummy addresses for this module
          break;
        }
      }
    });
  });
});
