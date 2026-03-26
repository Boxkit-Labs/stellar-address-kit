import { describe, it, expect } from "vitest";
import { parse } from "./parse";

describe("parse", () => {
  describe("G addresses", () => {
    it("should parse a valid G address", () => {
      const address =
        "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
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
      const mAddress =
        "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OAAAAAAAAAAAPOGVY";
      const result = parse(mAddress);

      if (result.kind === "M") {
        expect(result.address).toBe(mAddress);
        expect(result.baseG).toBe(
          "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
        );
        expect(result.muxedId).toBe(123n);
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });

    it("should parse M address with muxedId as bigint", () => {
      const mAddress =
        "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OAAAAAAAAAAAPOGVY";
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
        expect(result.baseG).toBe(
          "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
        );
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
        expect(result.baseG).toBe(
          "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
        );
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
        expect(result.baseG).toBe(
          "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
        );
      } else {
        throw new Error(`Expected M address, got ${result.kind}`);
      }
    });
  });

  describe("C addresses", () => {
    it("should parse a valid C address", () => {
      const address =
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
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

  describe("error cases", () => {
    it("should return invalid for address with unknown prefix", () => {
      const invalidAddress = "INVALID_ADDRESS";
      const result = parse(invalidAddress);

      if (result.kind === "invalid") {
        expect(result.error.code).toBe("UNKNOWN_PREFIX");
        expect(result.error.input).toBe(invalidAddress);
        expect(result.error.message).toBe("Invalid address");
      } else {
        throw new Error(`Expected invalid, got ${result.kind}`);
      }
    });

    it("should return invalid for seed key (S prefix)", () => {
      const seedKey =
        "SBZVMB74W5CWLWHLMIUBJD3JXWQGBU4QSI6YZFG5CKJLQX5YFZZXCVQN";
      const result = parse(seedKey);

      if (result.kind === "invalid") {
        expect(result.error.code).toBe("UNKNOWN_PREFIX");
      } else {
        throw new Error(`Expected invalid, got ${result.kind}`);
      }
    });

    it("should return invalid for federation address", () => {
      const fedAddress = "alice*stellar.org";
      const result = parse(fedAddress);

      if (result.kind === "invalid") {
        expect(result.error.code).toBe("UNKNOWN_PREFIX");
      } else {
        throw new Error(`Expected invalid, got ${result.kind}`);
      }
    });

    it("should return invalid for empty string", () => {
      const result = parse("");
      if (result.kind === "invalid") {
        expect(result.error.code).toBe("UNKNOWN_PREFIX");
      } else {
        throw new Error(`Expected invalid, got ${result.kind}`);
      }
    });

    it("should return invalid for G address with invalid checksum", () => {
      const invalidChecksum =
        "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2X";
      const result = parse(invalidChecksum);

      if (result.kind === "invalid") {
        expect(result.error.code).toBe("INVALID_CHECKSUM");
        expect(result.error.input).toBe(invalidChecksum);
      } else {
        throw new Error(`Expected invalid, got ${result.kind}`);
      }
    });

    it("should return invalid for random string", () => {
      const result = parse("not_an_address_at_all");
      expect(result.kind).toBe("invalid");
    });
  });

  describe("edge cases", () => {
    it("should return invalid for address with whitespace", () => {
      const addressWithSpace =
        " GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H ";
      expect(parse(addressWithSpace).kind).toBe("invalid");
    });

    it("should return invalid for very short string", () => {
      expect(parse("G").kind).toBe("invalid");
    });

    it("should return invalid for string with correct length but wrong prefix", () => {
      expect(parse("X".repeat(56)).kind).toBe("invalid");
    });
  });
});
