import { describe, it, expect } from "vitest";
import { validate } from "../index";

export const SAMPLE_G = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
export const SAMPLE_M = "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ";
export const SAMPLE_C = "CCW9YPBH5SVV6236SYYXX6ALX65H5NXV4S6A6U24S6ALX65H5NXV4S6A";

describe("validate", () => {
    it("returns true for a valid address when kind is omitted", () => {
        expect(validate(SAMPLE_G)).toBe(true);
    });

    it("returns false for a structurally invalid string", () => {
        expect(validate("not-a-stellar-address")).toBe(false);
    });

    it("returns true for a valid G address when kind is G", () => {
        expect(validate(SAMPLE_G, "G")).toBe(true);
    });

    it("returns true for a valid M address when kind is M", () => {
        expect(validate(SAMPLE_M, "M")).toBe(true);
    });

    it("returns false when kind is G but address is M", () => {
        expect(validate(SAMPLE_M, "G")).toBe(false);
    });

    it("returns false when kind is M but address is G", () => {
        expect(validate(SAMPLE_G, "M")).toBe(false);
    });

    it("accepts lowercase input for valid addresses", () => {
        expect(validate(SAMPLE_G.toLowerCase())).toBe(true);
    });
});
