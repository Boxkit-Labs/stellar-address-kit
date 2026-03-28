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
    }
  }
  return result;
}

function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc & 0xffff;
}

function decodeStrKey(address: string): Uint8Array {
  const up = address.toUpperCase();
  const decoded = decodeBase32(up);
  if (decoded.length < 3) throw new Error("invalid encoded string");

  const data = decoded.slice(0, decoded.length - 2);
  const checksum =
    decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
  const computed = crc16(data);
  if (computed !== checksum) throw new Error("invalid checksum");

  return data;
}

/**
 * Decodes a muxed Stellar address into its base G address and numeric ID.
 * Returns a typed structure to ensure native TypeScript protection and clean destructuring.
 * 
 * @param mAddress The muxed Stellar address (starts with M).
 * @returns An object containing the base G address and the 64-bit ID as a bigint.
 */
export function decodeMuxed(mAddress: string): { baseG: string; id: bigint } {
  const data = decodeStrKey(mAddress);
  // Layout for Muxed Address: [Version(1)] [Pubkey(32)] [ID(8)]
  if (data.length !== 41) throw new Error("invalid payload length");

  const pubkey = data.slice(1, 33);
  const idBytes = data.slice(33, 41);

  let id = 0n;
  for (const byte of idBytes) {
    id = (id << 8n) + BigInt(byte);
  }

  return {
    baseG: StrKey.encodeEd25519PublicKey(Buffer.from(pubkey)),
    id: id,
  };
}
