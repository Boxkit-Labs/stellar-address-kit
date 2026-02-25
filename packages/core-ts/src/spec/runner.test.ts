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
          const mAddress = encodeMuxed(baseG, c.input.id);
          expect(mAddress).toBe(c.expected.mAddress);
          break;
        }
        case "muxed_decode": {
          const result = decodeMuxed(c.input.mAddress);
          expect(result.baseG).toBe(c.expected.baseG);
          expect(result.id).toBe(c.expected.id);
          break;
        }
        case "extract_routing": {
          const result = extractRouting({
            destination: c.input.destination,
            memoType: c.input.memoType,
            memoValue: c.input.memoValue ?? null,
            sourceAccount: c.input.sourceAccount ?? null,
          });

          expect(result.destinationBaseAccount).toBe(
            c.expected.destinationBaseAccount,
          );
          expect(result.routingId).toBe(c.expected.routingId);
          expect(result.routingSource).toBe(c.expected.routingSource);

          // Deep comparison of warnings
          if (c.expected.warnings) {
            expect(result.warnings).toHaveLength(c.expected.warnings.length);
            c.expected.warnings.forEach((expectedWarn: any, i: number) => {
              const actualWarn = result.warnings[i];
              expect(actualWarn.code).toBe(expectedWarn.code);
              expect(actualWarn.severity).toBe(expectedWarn.severity);
              if (expectedWarn.normalization) {
                expect((actualWarn as any).normalization).toEqual(
                  expectedWarn.normalization,
                );
              }
              if (expectedWarn.context) {
                expect((actualWarn as any).context).toEqual(
                  expectedWarn.context,
                );
              }
            });
          } else {
            expect(result.warnings).toHaveLength(0);
          }
          break;
        }
      }
    });
  });
});
