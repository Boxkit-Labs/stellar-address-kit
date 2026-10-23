import { decodeMuxed } from "../muxed/decode";
import { detect } from "./detect";
import { ParseResult } from "./types";
import { AddressParseError } from "../address/errors";

/** Base32 alphabet used by StrKey (RFC 4648 without padding). */
const BASE32_CHARS = /^[A-Z2-7]+$/;

/** Expected total strkey length (version byte + payload + CRC16) per prefix. */
const EXPECTED_LENGTH: Record<"G" | "C" | "M", number> = {
  G: 56,
  C: 56,
  M: 69,
};

/**
 * Parses a Stellar address string and returns a structured result.
 * Supports G (Public Key), C (Contract), and M (Muxed) addresses.
 * 
 * Validation order: seed-key and federation rejection, then prefix, length
 * and Base32 structure, and finally the checksum. This ensures each failure
 * mode is reported with its specific error code instead of being
 * misclassified as a generic checksum failure.
 * 
 * @param address - The Stellar address string to parse.
 * @returns A {@link ParseResult} containing the parsed address components.
 * @throws {AddressParseError} With a specific code describing why validation
 * failed: REJECTED_SEED_KEY, FEDERATION_ADDRESS_NOT_SUPPORTED, UNKNOWN_PREFIX,
 * INVALID_LENGTH, INVALID_BASE32, or INVALID_CHECKSUM.
 */
export function parse(address: string): ParseResult {
  const up = address.toUpperCase();

  // Reject seed (secret) keys up front. They are sensitive material, must
  // never be treated as addresses, and must never be echoed back as valid
  // input — preventing accidental private key leakage through this parser.
  if (up.startsWith("S")) {
    throw new AddressParseError(
      "REJECTED_SEED_KEY",
      address,
      "Seed keys are not valid addresses"
    );
  }

  // Federation addresses (name*domain) require SEP-2 resolution, which this
  // parser does not perform.
  if (up.includes("*")) {
    throw new AddressParseError(
      "FEDERATION_ADDRESS_NOT_SUPPORTED",
      address,
      "Federation addresses are not supported"
    );
  }

  const prefix = up[0];

  if (prefix !== "G" && prefix !== "M" && prefix !== "C") {
    throw new AddressParseError("UNKNOWN_PREFIX", address, "Invalid address");
  }

  // Structural checks run before the checksum (via detect) so that length
  // and character problems are not misreported as INVALID_CHECKSUM.
  const expectedLength = EXPECTED_LENGTH[prefix];
  if (up.length !== expectedLength) {
    throw new AddressParseError(
      "INVALID_LENGTH",
      address,
      `Invalid address length: expected ${expectedLength} for ${prefix} addresses, got ${up.length}`
    );
  }

  if (!BASE32_CHARS.test(up)) {
    throw new AddressParseError(
      "INVALID_BASE32",
      address,
      "Address contains invalid Base32 characters"
    );
  }

  const kind = detect(up);

  if (kind === "invalid") {
    throw new AddressParseError(
      "INVALID_CHECKSUM",
      address,
      "Invalid address checksum"
    );
  }

  switch (kind) {
    case "G":
      return { kind: "G", address: up, warnings: [] };
    case "C":
      return { kind: "C", address: up, warnings: [] };
    case "M": {
      try {
        const decoded = decodeMuxed(up);
        return {
          kind: "M",
          address: up,
          baseG: decoded.baseG,
          muxedId: decoded.id,
          warnings: [],
        };
      } catch (error) {
        if (error instanceof AddressParseError) {
          throw error;
        }

        throw new AddressParseError(
          "INVALID_CHECKSUM",
          address,
          "Invalid muxed address"
        );
      }
    }
  }
}
