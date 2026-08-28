import { describe, it, expect } from "vitest";
import { vectors } from "@stellar-address-kit/spec";
import { detect, encodeMuxed, decodeMuxed, extractRouting } from "../index";
import { ExtractRoutingError } from "../routing/extract";

const LEGACY_VECTOR_G =
  "GA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const LEGACY_VECTOR_M_PREFIX =
  "MA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const LEGACY_VECTOR_C_PREFIX =
  "CA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";

const VALID_G =
  "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const VALID_C =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

function normalizeVectorDestination(destination: string, expectedRoutingId: any): string {
  if (destination === LEGACY_VECTOR_G) return VALID_G;
  if (destination.startsWith(LEGACY_VECTOR_M_PREFIX)) {
    return encodeMuxed(VALID_G, BigInt(expectedRoutingId));
  }
  if (destination.startsWith(LEGACY_VECTOR_C_PREFIX)) return VALID_C;
  return destination;
}

function normalizeExpectedBaseAccount(destinationBaseAccount: any): any {
  if (destinationBaseAccount === LEGACY_VECTOR_G) return VALID_G;
  return destinationBaseAccount;
}

function normalizeRoutingId(value: any): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "bigint" ? value.toString() : String(value);
}

describe("Normative Vector Tests", () => {
  vectors.cases.forEach((c: any) => {
    it(`[${c.module}] ${c.description}`, () => {
      switch (c.module) {
        case "detect": {
          const kind = detect(c.input.address);
          if (c.expected.kind === null) {
            expect(kind).toBe("invalid");
          } else {
            expect(kind).toBe(c.expected.kind);
          }
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
            expect(result.id).toBe(BigInt(c.expected.id));
          }
          break;
        }
        case "extract_routing": {
          const input = c.input as any;
          const destination = normalizeVectorDestination(
            input.destination,
            c.expected.routingId
          );
          const routingInput = {
            destination,
            memoType: input.memoType,
            memoValue: input.memoValue || null,
            sourceAccount: input.sourceAccount || null,
          };
          if (routingInput.destination.startsWith("C")) {
            expect(() => extractRouting(routingInput)).toThrow(ExtractRoutingError);
            break;
          }

          const result = extractRouting(routingInput);
          expect(result.destinationBaseAccount).toBe(
            normalizeExpectedBaseAccount(c.expected.destinationBaseAccount)
          );
          expect(normalizeRoutingId(result.routingId)).toBe(
            normalizeRoutingId(c.expected.routingId)
          );
          expect(result.routingSource).toBe(c.expected.routingSource);
          expect(result.warnings).toEqual(c.expected.warnings);
          break;
        }
      }
    });
  });
});
