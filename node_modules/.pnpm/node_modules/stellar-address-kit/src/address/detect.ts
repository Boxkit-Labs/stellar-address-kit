import { StrKey } from "@stellar/stellar-sdk";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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
 * Detects the kind of a Stellar address.
 * Standard addresses (G, M, C) are validated using the Stellar SDK.
 * Custom M-addresses (0x60 format) are validated using internal logic.
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
