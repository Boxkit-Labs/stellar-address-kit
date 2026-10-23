import { describe, it, expect } from "vitest";
import { parse } from "./parse";
import { AddressParseError, ErrorCode } from "./errors";

const VALID_G =
  "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const VALID_C =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const VALID_M =
  "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OAAAAAAAAAAAPOGVY";

/** Asserts parse(input) throws AddressParseError with the expected code and input. */
function expectParseCode(input: string, code: ErrorCode): void {
  expect(() => parse(input)).toThrowError(AddressParseError);

  try {
    parse(input);
  } catch (error) {
    expect(error).toBeInstanceOf(AddressParseError);
    if (error instanceof AddressParseError) {
      expect(error.code).toBe(code);
      expect(error.input).toBe(input);
    }
  }
}

describe("parse", () => {
  describe("G addresses", () => {
    it("should parse a valid G address", () => {
      const address = VALID_G;
      const result = parse(address);

      if (result.kind === "G") {
        expect(result.address).toBe(address);
      } else {
        throw new Error(`Expected G address, got ${result.kind}`);
      }
    });

    it("should normalize lowercase G address to uppercase", () => {
      const address =
        "gbrpyhil2ci3fnq4bxlfmndlfjunpu2hy3zmfshonuceoasw7qc7ox2h";
      const result = parse(address);

      if (result.kind === "G") {
        expect(result.address).toBe(address.toUpperCase());
      } else {
        throw new Error(`Expected G address, got ${result.kind}`);
      }
    });

    it("should parse a valid G address with mixed case", () => {
      const address =
        "GbRpYhIl2Ci3FnQ4BxLfMnDlFjUnPu2Hy3ZmFsHoNuCeOaSw7Qc7Ox2H";
      const result = parse(address);

      if (result.kind === "G") {
        expect(result.address).toBe(address.toUpperCase());
      } else {
        throw new Error(`Expected G address, got ${result.kind}`);
      }
    });
  });

  describe("M addresses", () => {
    it("should parse a valid M address and decode baseG and muxedId", () => {
      const mAddress = VALID_M;
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(result.address).toBe(mAddress);
        expect(result.baseG).toBe(VALID_G);
        expect(result.muxedId).toBe(123n);
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });

    it("should parse M address with muxedId as bigint", () => {
      const mAddress = VALID_M;
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(typeof result.muxedId).toBe("bigint");
        expect(result.muxedId).toBe(123n);
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });

    it("should parse M address with large muxedId (2^53+1 canary)", () => {
      const mAddress =
        "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OABAAAAAAAAAAGTO2";
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(result.muxedId).toBe(9007199254740993n);
        expect(result.baseG).toBe(VALID_G);
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });

    it("should parse M address with max uint64 muxedId", () => {
      const mAddress =
        "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7P7777777777776IDK";
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(result.muxedId).toBe(18446744073709551615n);
        expect(result.baseG).toBe(VALID_G);
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });

    it("should normalize lowercase M address to uppercase", () => {
      const mAddress =
        "mbrpyhil2ci3fnq4bxlfmndlfjunpu2hy3zmfshonuceoasw7qc7oaaaaaaaaaaapogvy";
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(result.address).toBe(mAddress.toUpperCase());
        expect(result.baseG).toBeDefined();
        expect(result.muxedId).toBeDefined();
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });

    it("should parse M address with muxedId of 0", () => {
      const mAddress =
        "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OAAAAAAAAAAAABYZG";
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(result.muxedId).toBe(0n);
        expect(result.baseG).toBe(VALID_G);
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });
  });

  describe("C addresses", () => {
    it("should parse a valid C address", () => {
      const address = VALID_C;
      const result = parse(address);

      if (result.kind === "C") {
        expect(result.address).toBe(address);
      } else {
        throw new Error(`Expected C address, got ${result.kind}`);
      }
    });

    it("should normalize lowercase C address to uppercase", () => {
      const address =
        "caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad2km";
      const result = parse(address);

      if (result.kind === "C") {
        expect(result.address).toBe(address.toUpperCase());
      } else {
        throw new Error(`Expected C address, got ${result.kind}`);
      }
    });
  });

  describe("error classification", () => {
    describe("REJECTED_SEED_KEY", () => {
      it("should reject a seed key (S prefix) instead of reporting a checksum failure", () => {
        const seedKey =
          "SBZVMB74W5CWLWHLMIUBJD3JXWQGBU4QSI6YZFG5CKJLQX5YFZZXCVQN";
        expectParseCode(seedKey, "REJECTED_SEED_KEY");
      });

      it("should reject a lowercase seed key", () => {
        const seedKey =
          "sbzvmb74w5cwlwhlmiubjd3jxwqgbu4qsi6yzfg5ckjlqx5yfzzxcvqn";
        expectParseCode(seedKey, "REJECTED_SEED_KEY");
      });

      it("should reject a bare S string", () => {
        expectParseCode("S", "REJECTED_SEED_KEY");
      });
    });

    describe("FEDERATION_ADDRESS_NOT_SUPPORTED", () => {
      it("should reject a federation address", () => {
        expectParseCode("alice*stellar.org", "FEDERATION_ADDRESS_NOT_SUPPORTED");
      });

      it("should reject an uppercase federation address", () => {
        expectParseCode("BOB*EXAMPLE.COM", "FEDERATION_ADDRESS_NOT_SUPPORTED");
      });
    });

    describe("INVALID_LENGTH", () => {
      it("should report a single-character G address as INVALID_LENGTH", () => {
        expectParseCode("G", "INVALID_LENGTH");
      });

      it("should report a truncated G address as INVALID_LENGTH", () => {
        expectParseCode(VALID_G.slice(0, 55), "INVALID_LENGTH");
      });

      it("should report a G address with an extra character as INVALID_LENGTH", () => {
        expectParseCode(`${VALID_G}H`, "INVALID_LENGTH");
      });

      it("should report a truncated C address as INVALID_LENGTH", () => {
        expectParseCode(VALID_C.slice(0, 40), "INVALID_LENGTH");
      });

      it("should report a C address with an extra character as INVALID_LENGTH", () => {
        expectParseCode(`${VALID_C}A`, "INVALID_LENGTH");
      });

      it("should report a truncated M address as INVALID_LENGTH", () => {
        expectParseCode(VALID_M.slice(0, 68), "INVALID_LENGTH");
      });

      it("should report an M address with an extra character as INVALID_LENGTH", () => {
        expectParseCode(`${VALID_M}A`, "INVALID_LENGTH");
      });

      it("should report an M-prefixed string of G length as INVALID_LENGTH", () => {
        expectParseCode(`M${VALID_G.slice(1)}`, "INVALID_LENGTH");
      });
    });

    describe("INVALID_BASE32", () => {
      it("should report a G address containing 0 as INVALID_BASE32", () => {
        expectParseCode(`${VALID_G.slice(0, -1)}0`, "INVALID_BASE32");
      });

      it("should report a G address containing 1 as INVALID_BASE32", () => {
        expectParseCode(`GBRPYHIL2C13FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H`, "INVALID_BASE32");
      });

      it("should report a G address containing 8 as INVALID_BASE32", () => {
        expectParseCode(`GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX8H`, "INVALID_BASE32");
      });

      it("should report a G address containing an embedded space as INVALID_BASE32", () => {
        expectParseCode(
          `${VALID_G.slice(0, 25)} ${VALID_G.slice(26)}`,
          "INVALID_BASE32"
        );
      });

      it("should report a C address containing a special character as INVALID_BASE32", () => {
        expectParseCode(`${VALID_C.slice(0, -1)}$`, "INVALID_BASE32");
      });

      it("should report an M address containing a non-Base32 character as INVALID_BASE32", () => {
        expectParseCode(`${VALID_M.slice(0, -1)}#`, "INVALID_BASE32");
      });
    });

    describe("INVALID_CHECKSUM", () => {
      it("should report a G address with a bad checksum as INVALID_CHECKSUM", () => {
        expectParseCode(
          "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2X",
          "INVALID_CHECKSUM"
        );
      });

      it("should report a C address with a bad checksum as INVALID_CHECKSUM", () => {
        expectParseCode(
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KN",
          "INVALID_CHECKSUM"
        );
      });

      it("should report an M address with a bad checksum as INVALID_CHECKSUM", () => {
        expectParseCode(
          "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OAAAAAAAAAAAPOGVZ",
          "INVALID_CHECKSUM"
        );
      });
    });

    describe("UNKNOWN_PREFIX", () => {
      it("should report a non-address string as UNKNOWN_PREFIX", () => {
        expectParseCode("INVALID_ADDRESS", "UNKNOWN_PREFIX");
      });

      it("should report a correctly sized string with a wrong prefix as UNKNOWN_PREFIX", () => {
        expectParseCode("X".repeat(56), "UNKNOWN_PREFIX");
      });
    });
  });

  describe("error cases", () => {
    it("should throw AddressParseError for address with unknown prefix", () => {
      const invalidAddress = "INVALID_ADDRESS";
      expect(() => parse(invalidAddress)).toThrowError(AddressParseError);

      try {
        parse(invalidAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(AddressParseError);
        if (error instanceof AddressParseError) {
          expect(error.code).toBe("UNKNOWN_PREFIX");
          expect(error.input).toBe(invalidAddress);
          expect(error.message).toBe("Invalid address");
        }
      }
    });

    it("should throw AddressParseError for seed key (S prefix)", () => {
      const seedKey =
        "SBZVMB74W5CWLWHLMIUBJD3JXWQGBU4QSI6YZFG5CKJLQX5YFZZXCVQN";
      expect(() => parse(seedKey)).toThrowError(AddressParseError);
      expectParseCode(seedKey, "REJECTED_SEED_KEY");
    });

    it("should throw AddressParseError for federation address", () => {
      const fedAddress = "alice*stellar.org";
      expect(() => parse(fedAddress)).toThrowError(AddressParseError);
      expectParseCode(fedAddress, "FEDERATION_ADDRESS_NOT_SUPPORTED");
    });

    it("should throw AddressParseError for empty string", () => {
      expect(() => parse("")).toThrowError(AddressParseError);
      expectParseCode("", "UNKNOWN_PREFIX");
    });

    it("should throw AddressParseError for G address with invalid checksum", () => {
      const invalidChecksum =
        "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2X";

      expect(() => parse(invalidChecksum)).toThrowError(AddressParseError);
      try {
        parse(invalidChecksum);
      } catch (error) {
        expect(error).toBeInstanceOf(AddressParseError);
        if (error instanceof AddressParseError) {
          expect(error.code).toBe("INVALID_CHECKSUM");
          expect(error.input).toBe(invalidChecksum);
        }
      }
    });

    it("should throw AddressParseError for random string", () => {
      expect(() => parse("not_an_address_at_all")).toThrowError(
        AddressParseError
      );
    });
  });

  describe("edge cases", () => {
    it("should throw AddressParseError for address with whitespace", () => {
      const addressWithSpace = ` ${VALID_G} `;
      expect(() => parse(addressWithSpace)).toThrowError(AddressParseError);
    });

    it("should throw AddressParseError for very short string", () => {
      expect(() => parse("G")).toThrowError(AddressParseError);
      expectParseCode("G", "INVALID_LENGTH");
    });

    it("should throw AddressParseError for string with correct length but wrong prefix", () => {
      expect(() => parse("X".repeat(56))).toThrowError(AddressParseError);

    });
  });
});
