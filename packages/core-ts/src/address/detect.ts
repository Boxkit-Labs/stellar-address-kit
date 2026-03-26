import StellarSdk from "@stellar/stellar-sdk";

const { StrKey } = StellarSdk;

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * @param input - The Base32-encoded string to decode.
 * @returns A Uint8Array containing the decoded binary data.
 *
 * @throws {Error} If the input contains characters not found in the Base32 alphabet.
 *
 * @example
 * const bytes = decodeBase32("MZXW6==="); // "foo"
 * console.log(new TextDecoder().decode(bytes)); // "foo"
 */
function decodeBase32(input: string): Uint8Array {
  const s = input.toUpperCase().replace(/=+$/, "");
  const byteCount = Math.floor((s.length * 5) / 8);
  const result = new Uint8Array(byteCount);
  let buffer = 0;
  let bitsLeft = 0;
  let byteIndex = 0;
  for (const ch of s) {
    const value = BASE32_CHARS.indexOf(ch);
    if (value === -1) throw new Error(`Invalid base32 character: ${ch}`);
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      if (byteIndex < byteCount) {
        result[byteIndex++] = (buffer >> (bitsLeft - 8)) & 0xff;
      }
      bitsLeft -= 8;
      buffer &= (1 << bitsLeft) - 1;
    }
  }
  return result;
}

/**
 * Computes a 16-bit CRC (Cyclic Redundancy Check) for the given byte array.
 *
 * This implementation uses the CRC-16-CCITT polynomial (0x1021) with:
 * - Initial value: 0x0000
 * - No reflection (input or output)
 * - No final XOR
 *
 * The function processes each byte bit-by-bit, updating the CRC value
 * using a shift register and polynomial XOR operations.
 *
 * @param bytes - The input data as a Uint8Array.
 * @returns The computed 16-bit CRC value as a number (0–65535).
 *
 * @example
 * const data = new Uint8Array([0x01, 0x02, 0x03]);
 * const checksum = crc16(data);
 * console.log(checksum); // e.g., 0x6131
 */
function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * Detects the type of a Stellar address.
 *
 * The function classifies the input string into one of the following:
 * - `"G"`: Ed25519 public key (standard account address)
 * - `"M"`: Med25519 (muxed) account address
 * - `"C"`: Contract address
 * - `"invalid"`: Not a valid or recognized address
 *
 * Detection is performed in two stages:
 * 1. Uses official `StrKey` validation methods for known address types.
 * 2. Falls back to manual validation for muxed (`"M"`) addresses by:
 *    - Decoding the Base32 string
 *    - Verifying structure (length and version byte)
 *    - Validating the CRC16 checksum
 *
 * @param address - The address string to evaluate.
 * @returns A string indicating the detected address type or `"invalid"` if none match.
 *
 * @example
 * detect("GBRPYHIL2C..."); // "G"
 * detect("MA3D5F...");     // "M"
 * detect("CA7Q...");       // "C"
 * detect("invalid");       // "invalid"
 */
export function detect(address: string): "G" | "M" | "C" | "invalid" {
  if (!address) return "invalid";
  const up = address.toUpperCase();

  // 1. Try standard SDK validation (prioritize these)
  if (StrKey.isValidEd25519PublicKey(up)) return "G";
  if (StrKey.isValidMed25519PublicKey(up)) return "M";
  if (StrKey.isValidContract(up)) return "C";

  // 2. Fallback for custom 0x60 muxed addresses
  try {
    const prefix = up[0];
    if (prefix === "M") {
      const decoded = decodeBase32(up);
      // M-addresses are 43 bytes: 1 (version) + 32 (pubkey) + 8 (id) + 2 (checksum)
      if (decoded.length === 43 && decoded[0] === 0x60) {
        const data = decoded.slice(0, decoded.length - 2);
        const checksum =
          decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
        if (crc16(data) === checksum) {
          return "M";
        }
      }
    }
  } catch {
    // Ignore and proceed to return "invalid"
  }

  return "invalid";
}
