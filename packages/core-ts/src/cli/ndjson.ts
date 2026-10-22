import type { RoutingResult } from "../routing/types";

export interface NdjsonRecord {
  index: number;
  destination: string;
  memoType: string;
  memoValue: string | null;
  ok: boolean;
  result?: RoutingResult;
  error?: string;
}

/**
 * Serialize a value to a JSON string, converting bigints to strings.
 */
export function stringifyWithBigint(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    typeof val === "bigint" ? val.toString() : val
  );
}

/**
 * Write a single NDJSON record as a line to the provided writable stream.
 */
export function writeNdjson(
  stream: NodeJS.WritableStream,
  record: NdjsonRecord
): void {
  stream.write(stringifyWithBigint(record) + "\n");
}
