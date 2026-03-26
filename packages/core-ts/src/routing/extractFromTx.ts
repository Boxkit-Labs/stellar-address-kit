import StellarSdk from "@stellar/stellar-sdk";
import { RoutingResult } from "./types";
import { extractRouting } from "./extract";

const { Transaction } = StellarSdk;

/**
 * Extracts routing information from a Stellar transaction.
 *
 * @param {Transaction} tx - The transaction to extract routing info from.
 * @returns {RoutingResult | null} The routing result or null if the transaction is not a simple payment.
 */
export function extractRoutingFromTx(tx: any): RoutingResult | null {
  const op = tx.operations[0];
  if (!op || op.type !== "payment") return null;

  return extractRouting({
    destination: op.destination,
    memoType: tx.memo.type,
    memoValue: tx.memo.value?.toString() ?? null,
    sourceAccount: tx.source ?? null,
  });
}
