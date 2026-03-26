import StellarSdk from "@stellar/stellar-sdk";

const { Account, MuxedAccount, StrKey } = StellarSdk;

const MAX_UINT64 = 18446744073709551615n;

/**
 * IMPORTANT: ID variables MUST always remain as bigint
 * 
 * JavaScript's default number type uses 64-bit floating point (IEEE 754),
 * which can only safely represent integers up to 2^53 - 1. Attempting to
 * use regular numbers for ID values will result in precision loss and
 * incorrect muxed address generation.
 * 
 * All ID parameters and variables must be explicitly typed as bigint.
 * This constraint is enforced at runtime.
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
