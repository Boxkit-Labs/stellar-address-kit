import {
  FeeBumpTransaction,
  Networks,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { extractRouting } from "./extract";
import { RoutingResult } from "./types";
import { WarningSeverity } from "../address/types";

/** Operation types that carry a payment destination. */
export type PaymentOperationType =
  | "payment"
  | "pathPaymentStrictReceive"
  | "pathPaymentStrictSend";

const PAYMENT_OPERATION_TYPES: ReadonlySet<string> = new Set<PaymentOperationType>([
  "payment",
  "pathPaymentStrictReceive",
  "pathPaymentStrictSend",
]);

/** A Horizon transaction record (only the envelope is required). */
export type HorizonTransactionLike = { envelope_xdr: string };

/**
 * Any transaction shape accepted by {@link extractAllRoutingFromTx}:
 * a decoded `Transaction` / `FeeBumpTransaction` from `@stellar/stellar-sdk`,
 * a base64 TransactionEnvelope XDR string, or a Horizon transaction record.
 */
export type TransactionInput =
  | Transaction
  | FeeBumpTransaction
  | string
  | HorizonTransactionLike;

export type ExtractFromTxOptions = {
  /** Network passphrase used to decode XDR input. Defaults to the public network. */
  networkPassphrase?: string;
  /** Forwarded to `extractRouting`. */
  allowHashRouting?: boolean;
  /** Forwarded to `extractRouting`. */
  minSeverityLevel?: WarningSeverity;
};

export type TxRoutingResult = {
  /** Zero-based index of the operation in the transaction. */
  operationIndex: number;
  operationType: PaymentOperationType;
  /** Canonical routing result for the operation destination and tx memo. */
  routing: RoutingResult;
};

export class ExtractFromTxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractFromTxError";
    Object.setPrototypeOf(this, ExtractFromTxError.prototype);
  }
}

function toTransaction(
  tx: TransactionInput,
  networkPassphrase: string
): Transaction {
  let decoded: Transaction | FeeBumpTransaction;
  if (tx instanceof Transaction || tx instanceof FeeBumpTransaction) {
    decoded = tx;
  } else {
    const xdr =
      typeof tx === "string"
        ? tx
        : tx && typeof tx === "object" && typeof tx.envelope_xdr === "string"
          ? tx.envelope_xdr
          : null;
    if (xdr === null) {
      throw new ExtractFromTxError(
        "Unsupported transaction input: expected a Transaction, FeeBumpTransaction, XDR string, or Horizon record."
      );
    }
    try {
      decoded = TransactionBuilder.fromXDR(xdr.trim(), networkPassphrase);
    } catch (error) {
      throw new ExtractFromTxError(
        `Invalid transaction XDR: ${(error as Error).message}`
      );
    }
  }
  return decoded instanceof FeeBumpTransaction ? decoded.innerTransaction : decoded;
}

const utf8Decoder = new TextDecoder("utf-8");

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function memoFields(tx: Transaction): { memoType: string; memoValue: string | null } {
  const memo = tx.memo;
  const value = memo.value as unknown;
  switch (memo.type) {
    case "id":
      return { memoType: "id", memoValue: String(value) };
    case "text":
      return {
        memoType: "text",
        memoValue:
          typeof value === "string" ? value : utf8Decoder.decode(value as Uint8Array),
      };
    case "hash":
    case "return":
      return {
        memoType: memo.type,
        memoValue: bytesToHex(value as Uint8Array),
      };
    default:
      return { memoType: "none", memoValue: null };
  }
}

/**
 * Extracts routing results for every payment-like operation
 * (`payment`, `pathPaymentStrictReceive`, `pathPaymentStrictSend`) in a
 * transaction, in operation order. Non-payment operations are ignored.
 * Fee-bump transactions are unwrapped to their inner transaction. The
 * transaction memo applies to every operation, and an operation-level source
 * account overrides the transaction source.
 */
export function extractAllRoutingFromTx(
  tx: TransactionInput,
  options: ExtractFromTxOptions = {}
): TxRoutingResult[] {
  const transaction = toTransaction(tx, options.networkPassphrase ?? Networks.PUBLIC);
  const { memoType, memoValue } = memoFields(transaction);

  const results: TxRoutingResult[] = [];
  transaction.operations.forEach((op, index) => {
    if (!PAYMENT_OPERATION_TYPES.has(op.type)) return;
    const destination = (op as { destination: string }).destination;
    results.push({
      operationIndex: index,
      operationType: op.type as PaymentOperationType,
      routing: extractRouting(
        {
          destination,
          memoType,
          memoValue,
          sourceAccount: op.source ?? transaction.source ?? null,
          minSeverityLevel: options.minSeverityLevel,
        },
        { allowHashRouting: options.allowHashRouting }
      ),
    });
  });
  return results;
}

/**
 * Extracts the routing result for the first payment-like operation in a
 * transaction. Returns `null` when the transaction has no payment operation.
 */
export function extractRoutingFromTx(
  tx: TransactionInput,
  options: ExtractFromTxOptions = {}
): TxRoutingResult | null {
  return extractAllRoutingFromTx(tx, options)[0] ?? null;
}
