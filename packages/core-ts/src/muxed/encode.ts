import StellarSdk from "@stellar/stellar-sdk";

const { Account, MuxedAccount, StrKey } = StellarSdk;

const MAX_UINT64 = 18446744073709551615n;

/**
 * Encodes a muxed Stellar address using a base G address and numeric ID.
 *
 * @param baseG - The base G address (Ed25519 public key) to mux with
 * @param id - The numeric ID to append to the base address (must be uint64)
 * @returns The encoded muxed address string
 * @throws {TypeError} When the ID parameter is not a bigint
 * @throws {RangeError} When the ID is outside the uint64 range (0 to 18446744073709551615)
 * @throws {Error} When the base G address is not a valid Ed25519 public key
 */
export function encodeMuxed(baseG: string, id: bigint): string {
  if (typeof id !== "bigint") {
    throw new TypeError(`ID must be a bigint, received ${typeof id}`);
  }

  if (id < 0n || id > MAX_UINT64) {
    throw new RangeError(`ID is outside the uint64 range: ${id.toString()}`);
  }

  if (StrKey.isValidEd25519PublicKey(baseG) === false) {
    throw new Error(`Invalid base G address: ${baseG}`);
  }

  const baseAccount = new Account(baseG, "0");
  const muxedAccount = new MuxedAccount(baseAccount, id.toString());

  return muxedAccount.accountId();
}
