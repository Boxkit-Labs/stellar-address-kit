import { MuxedAccount } from "@stellar/stellar-sdk";
import { MuxedResult } from "./types";

/**
 * Decodes a Stellar muxed address (M-address).
 *
 * @param {string} mAddress - The muxed address to decode.
 * @returns {baseG: string, id: bigint}
 */
export function decodeMuxed(mAddress: string): MuxedResult {
  const muxed = MuxedAccount.fromAddress(mAddress, "0");
  return {
    baseG: muxed.baseAccount().accountId(),
    id: BigInt(muxed.id()),
  };
}
