import type { RoutingResult } from "../routing/types";

/**
 * Machine-readable failure codes attached to batch NDJSON records.
 *
 * Kept deliberately small and stable: operators pipe these streams into
 * reconciliation jobs, so the set of codes is part of the CLI contract.
 */
export type BatchErrorCode =
  | "MISSING_DESTINATION"
  | "INVALID_RECORD"
  | "INVALID_JSON"
  | "ROUTING_ERROR";

/** Structured failure information for a single batch record. */
export interface BatchError {
  code: BatchErrorCode;
  message: string;
}

/**
 * Outcome of processing one input row.
 *
 * - `ok`: routed cleanly with no warnings.
 * - `warning`: routed, but advisories were emitted (`info` or `warn`).
 * - `error`: could not be parsed, failed to route, or produced an
 *   error-severity warning. Batch mode exits non-zero when any record has
 *   this status.
 */
export type BatchStatus = "ok" | "warning" | "error";

/** One line of the NDJSON stream emitted by `stellar-route` batch mode. */
export interface NdjsonRecord {
  /** Zero-based position of the record within the stream. */
  index: number;
  /** One-based source line (CSV row / NDJSON line) where the record starts. */
  line: number | null;
  /** Aggregated routing outcome for this record. */
  status: BatchStatus;
  /** Destination exactly as supplied (sanitization happens inside routing). */
  destination: string;
  /** Normalized memo type used for routing. */
  memoType: string;
  /** Raw memo value, when the row supplied one. */
  memoValue: string | null;
  /** Source account used for contract-sender detection, when supplied. */
  sourceAccount: string | null;
  /** Routing result, present whenever extraction ran. */
  result?: RoutingResult;
  /** Structured failure, present whenever `status` is `error`. */
  error?: BatchError;
}

/**
 * `JSON.stringify` replacer that turns BigInt routing IDs into strings.
 *
 * `RoutingResult.routingId` is `string | bigint | null` and Soroban memo ids
 * routinely exceed `Number.MAX_SAFE_INTEGER`, so a bare `JSON.stringify`
 * would throw. Stringifying keeps full uint64 precision for auditors.
 */
export function sanitizeBigInts(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Serialize a value to JSON with BigInt values represented as strings. */
export function stringifyWithBigint(value: unknown): string {
  return JSON.stringify(value, sanitizeBigInts);
}

/** Serialize a single record to its one-line NDJSON representation. */
export function toNdjsonLine(record: NdjsonRecord): string {
  return stringifyWithBigint(record);
}

/**
 * Write a single NDJSON record (plus trailing newline) to `stream`.
 *
 * Returns `false` when the stream signalled backpressure so callers can wait
 * for `drain` before pushing more high-volume batches.
 */
export function writeNdjson(
  stream: NodeJS.WritableStream,
  record: NdjsonRecord
): boolean {
  return stream.write(`${toNdjsonLine(record)}\n`);
}
