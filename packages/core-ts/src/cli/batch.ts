import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { extractRouting } from "../routing/extract";
import type { RoutingInput } from "../routing/types";
import type { NdjsonRecord } from "./ndjson";

export interface BatchRowInput {
  destination: string;
  memoType?: string;
  memoValue?: string | null;
}

export interface BatchProcessResult {
  records: NdjsonRecord[];
  hasErrors: boolean;
}

/**
 * Parse a CSV line into fields, handling quoted values and escaped quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Convert a raw row object into a BatchRowInput.
 */
function toBatchRow(row: Record<string, unknown>): BatchRowInput | null {
  const dest = row.destination ?? row.dest ?? row.address;
  if (typeof dest !== "string" || dest.trim() === "") {
    return null;
  }

  const memoTypeRaw = row.memoType ?? row.type ?? "none";
  const memoValueRaw = row.memoValue ?? row.memo ?? null;

  return {
    destination: dest.trim(),
    memoType: typeof memoTypeRaw === "string" ? memoTypeRaw : "none",
    memoValue: memoValueRaw === null || memoValueRaw === undefined ? null : String(memoValueRaw),
  };
}

/**
 * Process a single row and produce an NDJSON record.
 */
function processRow(row: BatchRowInput, index: number): NdjsonRecord {
  const input: RoutingInput = {
    destination: row.destination,
    memoType: row.memoType ?? "none",
    memoValue: row.memoValue ?? null,
    sourceAccount: null,
  };

  try {
    const result = extractRouting(input);
    return {
      index,
      destination: row.destination,
      memoType: input.memoType,
      memoValue: input.memoValue,
      ok: true,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      index,
      destination: row.destination,
      memoType: input.memoType,
      memoValue: input.memoValue,
      ok: false,
      error: message,
    };
  }
}

/**
 * Process an array of rows and return NDJSON records along with an error flag.
 */
export function processRows(rows: BatchRowInput[]): BatchProcessResult {
  const records = rows.map((row, index) => processRow(row, index));
  const hasErrors = records.some((r) => !r.ok);
  return { records, hasErrors };
}

/**
 * Parse a CSV stream into BatchRowInput rows.
 */
export async function* parseCsvStream(
  stream: Readable
): AsyncGenerator<BatchRowInput> {
  const rii = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;

  for await (const line of rli) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const fields = parseCsvLine(trimmed);

    if (!headers) {
      headers = fields.map((h) => h.trim());
      continue;
    }

    const row: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = fields[i] ?? "";
    }

    const batchRow = toBatchRow(row);
    if (batchRow) {
      yield batchRow;
    }
  }
}

/**
 * Parse a JSON stream (either an array or NDJSON) into BatchRowInput rows.
 */
export async function* parseJsonStream(
  stream: Readable
): AsyncGenerator<BatchRowInput> {
  const rli = createInterface({ input: stream, crlfDelay: Infinity });
  const chunks: string[] = [];

  for await (const line of rli) {
    chunks.push(line);
  }

  const raw = chunks.join("\n").trim();
  if (raw === "") return;

  // Try parsing as a JSON array or object first.
  try {
    const parsed = JSON.parse(raw);
    const array = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of array) {
      if (item && typeof item === "object") {
        const batchRow = toBatchRow(item as Record<string, unknown>);
        if (batchRow) {
          yield batchRow;
        }
      }
    }
    return;
  } catch {
    // Fall through to NDJSON parsing.
  }

  // Fall back to NDJSON (one JSON object per line).
  for (const line of chunks) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const item = JSON.parse(trimmed);
      if (item && typeof item === "object") {
        const batchRow = toBatchRow(item as Record<string, unknown>);
        if (batchRow) {
          yield batchRow;
        }
      }
    } catch {
      // Skip malformed lines.
    }
  }
}

/**
 * Detect the input format based on file extension or content sniffer.
 */
export function detectFormat(filePath: string | null): "csv" | "json" {
  if (filePath) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".csv")) return "csv";
    if (lower.endsWith(".json") || lower.endsWith(".ndjson")) return "json";
  }
  return "csv";
}

/**
 * Open a readable stream from a file path or stdin.
 */
export function openInputStream(filePath: string | null): Readable {
  if (filePath) {
    return createReadStream(filePath, { encoding: "utf8" });
  }
  return process.stdin;
}
