import { StringDecoder } from "node:string_decoder";
import type { Readable } from "node:stream";
import { extractRouting } from "../routing/extract";
import type { RoutingInput } from "../routing/types";
import type { BatchError, BatchStatus, NdjsonRecord } from "./ndjson";

/** Input formats supported by `stellar-route --file` / `--stdin`. */
export type BatchFormat = "csv" | "json" | "ndjson";

/** Normalized view of a single batch row. */
export interface BatchRow {
  destination: string;
  memoType: string;
  memoValue: string | null;
  sourceAccount: string | null;
}

/**
 * One parsed element of a batch stream: either a usable row or a structured
 * error that will be emitted as an NDJSON record without aborting the stream.
 */
export type ParsedBatchItem =
  | { kind: "row"; line: number; row: BatchRow }
  | { kind: "error"; line: number; destination: string; error: BatchError };

export type CanonicalField =
  | "destination"
  | "memoType"
  | "memoValue"
  | "sourceAccount";

const CANONICAL_FIELDS: CanonicalField[] = [
  "destination",
  "memoType",
  "memoValue",
  "sourceAccount",
];

/**
 * Accepted column names per canonical field.
 *
 * Values are normalized with {@link normalizeFieldName} first, so both
 * `memo_type` and `memoType` collapse to the same lookup key.
 */
const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  destination: [
    "destination",
    "dest",
    "address",
    "to",
    "account",
    "destination_address",
    "destinationaddress",
    "stellar_address",
    "stellaraddress",
    "recipient",
  ],
  memoType: ["memo_type", "memotype", "type", "memo_kind", "memokind"],
  memoValue: [
    "memo",
    "memo_value",
    "memovalue",
    "memo_id",
    "memoid",
    "memo_text",
    "memotext",
    "routing_id",
    "routingid",
  ],
  sourceAccount: [
    "source_account",
    "sourceaccount",
    "source",
    "from",
    "sender",
    "sender_account",
    "senderaccount",
  ],
};

const FIELD_LOOKUP = new Map<string, CanonicalField>();
for (const field of CANONICAL_FIELDS) {
  for (const alias of FIELD_ALIASES[field]) {
    FIELD_LOOKUP.set(alias, field);
  }
}

const MEMO_TYPE_ALIASES: Record<string, string> = {
  none: "none",
  memo_none: "none",
  "0": "none",
  id: "id",
  memo_id: "id",
  uint64: "id",
  text: "text",
  memo_text: "text",
  string: "text",
  hash: "hash",
  memo_hash: "hash",
  return: "return",
  memo_return: "return",
};

function normalizeFieldName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Map a CSV header or JSON key to its canonical field, if recognized. */
export function canonicalField(name: string): CanonicalField | null {
  return FIELD_LOOKUP.get(normalizeFieldName(name)) ?? null;
}

/**
 * Normalize a memo type token.
 *
 * When the row provides a memo but no memo type, `text` is inferred: numeric
 * memo text is still routable, and any non-numeric value produces the usual
 * `MEMO_TEXT_UNROUTABLE` warning instead of being silently dropped.
 */
export function normalizeMemoType(
  raw: string,
  memoValue: string | null
): string {
  const key = normalizeFieldName(raw);
  if (key === "") {
    return memoValue === null ? "none" : "text";
  }
  return MEMO_TYPE_ALIASES[key] ?? key;
}

function buildRow(
  get: (field: CanonicalField) => string | null,
  line: number
): ParsedBatchItem {
  const destination = (get("destination") ?? "").trim();
  const memoValueRaw = get("memoValue");
  const memoValue =
    memoValueRaw === null || memoValueRaw.trim() === "" ? null : memoValueRaw;
  const sourceRaw = (get("sourceAccount") ?? "").trim();

  if (destination === "") {
    return {
      kind: "error",
      line,
      destination: "",
      error: {
        code: "MISSING_DESTINATION",
        message:
          "Row is missing a destination/address value; expected one of: destination, address, dest, to.",
      },
    };
  }

  return {
    kind: "row",
    line,
    row: {
      destination,
      memoType: normalizeMemoType(get("memoType") ?? "", memoValue),
      memoValue,
      sourceAccount: sourceRaw === "" ? null : sourceRaw,
    },
  };
}

/** Build a row from a JSON/NDJSON object using the shared field aliases. */
export function rowFromObject(value: unknown, line: number): ParsedBatchItem {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      kind: "error",
      line,
      destination: "",
      error: {
        code: "INVALID_RECORD",
        message: "Expected a JSON object with a destination/address field.",
      },
    };
  }

  const values = new Map<CanonicalField, string>();
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const field = canonicalField(key);
    if (!field || raw === null || raw === undefined) continue;
    if (typeof raw === "object") continue;
    if (!values.has(field)) values.set(field, String(raw));
  }

  return buildRow((field) => values.get(field) ?? null, line);
}

async function* decodeChunks(stream: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder("utf8");

  for await (const chunk of stream) {
    if (typeof chunk === "string") {
      yield chunk;
    } else {
      yield decoder.write(chunk);
    }
  }

  const tail = decoder.end();
  if (tail !== "") yield tail;
}

async function* withPrefix(
  prefix: string,
  rest: AsyncIterator<string>
): AsyncGenerator<string> {
  if (prefix !== "") yield prefix;
  for (;;) {
    const { value, done } = await rest.next();
    if (done) return;
    yield value;
  }
}

function isWhitespace(char: string): boolean {
  return (
    char === " " ||
    char === "\t" ||
    char === "\r" ||
    char === "\n" ||
    char === "\f" ||
    char === "\v"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

type CsvRecord =
  | { kind: "record"; line: number; fields: string[] }
  | { kind: "error"; line: number; message: string };

/**
 * Streaming RFC 4180 CSV reader.
 *
 * Handles quoted fields, escaped quotes (`""`) and quoted values containing
 * embedded newlines; a quoted field may span chunk boundaries.
 */
async function* parseCsvRecords(
  chunks: AsyncIterable<string>
): AsyncGenerator<CsvRecord> {
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let pendingQuote = false;
  let recordStarted = false;
  let line = 1;
  let recordLine = 1;
  let firstChunk = true;

  for await (const chunk of chunks) {
    const text = firstChunk ? chunk.replace(/^\uFEFF/, "") : chunk;
    firstChunk = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (pendingQuote) {
        pendingQuote = false;
        if (char === '"') {
          // Escaped quote split across a chunk boundary.
          field += '"';
          recordStarted = true;
          continue;
        }
        inQuotes = false;
      }

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < text.length) {
            if (text[i + 1] === '"') {
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            // Cannot tell whether this closes the field or escapes a quote
            // that starts the next chunk; resolve on the next iteration.
            pendingQuote = true;
          }
        } else {
          field += char;
          recordStarted = true;
          if (char === "\n") line++;
        }
        continue;
      }

      if (char === '"') {
        if (!recordStarted) {
          recordStarted = true;
          recordLine = line;
        }
        inQuotes = true;
        continue;
      }

      if (char === ",") {
        if (!recordStarted) {
          recordStarted = true;
          recordLine = line;
        }
        fields.push(field);
        field = "";
        continue;
      }

      if (char === "\r") continue;

      if (char === "\n") {
        if (recordStarted || fields.length > 0 || field !== "") {
          yield { kind: "record", line: recordLine, fields: [...fields, field] };
        }
        line++;
        field = "";
        fields = [];
        recordStarted = false;
        recordLine = line;
        continue;
      }

      if (!recordStarted) {
        recordStarted = true;
        recordLine = line;
      }
      field += char;
    }
  }

  if (pendingQuote) {
    pendingQuote = false;
    inQuotes = false;
  }

  if (inQuotes) {
    yield {
      kind: "error",
      line: recordLine,
      message: "Unterminated quoted field at end of CSV input.",
    };
    return;
  }

  if (recordStarted || fields.length > 0 || field !== "") {
    yield { kind: "record", line: recordLine, fields: [...fields, field] };
  }
}

async function* parseCsvBatch(
  chunks: AsyncIterable<string>
): AsyncGenerator<ParsedBatchItem> {
  let header: (CanonicalField | null)[] | null = null;

  for await (const record of parseCsvRecords(chunks)) {
    if (record.kind === "error") {
      yield {
        kind: "error",
        line: record.line,
        destination: "",
        error: { code: "INVALID_RECORD", message: record.message },
      };
      continue;
    }

    // Ignore blank / whitespace-only lines (common at EOF or between blocks).
    if (record.fields.every((value) => value.trim() === "")) continue;

    if (header === null) {
      header = record.fields.map((name) => canonicalField(name));
      if (!header.includes("destination")) {
        yield {
          kind: "error",
          line: record.line,
          destination: "",
          error: {
            code: "INVALID_RECORD",
            message:
              "CSV header must include a destination column; expected one of: destination, address, dest, to.",
          },
        };
        return;
      }
      continue;
    }

    const values = new Map<CanonicalField, string>();
    for (let i = 0; i < header.length; i++) {
      const field = header[i];
      if (!field) continue;
      const raw = record.fields[i];
      if (raw === undefined) continue;
      if (!values.has(field)) values.set(field, raw);
    }

    yield buildRow((field) => values.get(field) ?? null, record.line);
  }
}

function parseJsonValue(text: string, line: number): ParsedBatchItem {
  try {
    return rowFromObject(JSON.parse(text), line);
  } catch (error) {
    return {
      kind: "error",
      line,
      destination: "",
      error: {
        code: "INVALID_JSON",
        message: `Invalid JSON at line ${line}: ${messageOf(error)}`,
      },
    };
  }
}

async function* parseNdjsonBatch(
  chunks: AsyncIterable<string>
): AsyncGenerator<ParsedBatchItem> {
  let buffer = "";
  let line = 1;
  let firstChunk = true;

  const handleLine = (text: string, lineNumber: number): ParsedBatchItem | null => {
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (trimmed === "") return null;
    try {
      return rowFromObject(JSON.parse(trimmed), lineNumber);
    } catch (error) {
      return {
        kind: "error",
        line: lineNumber,
        destination: "",
        error: {
          code: "INVALID_JSON",
          message: `Invalid NDJSON on line ${lineNumber}: ${messageOf(error)}`,
        },
      };
    }
  };

  for await (const chunk of chunks) {
    const text = firstChunk ? chunk.replace(/^\uFEFF/, "") : chunk;
    firstChunk = false;
    buffer += text;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const item = handleLine(buffer.slice(0, newlineIndex), line);
      if (item) yield item;
      buffer = buffer.slice(newlineIndex + 1);
      line++;
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const item = handleLine(buffer, line);
  if (item) yield item;
}

/**
 * Streaming JSON reader that accepts either a top-level array or a single
 * object.
 *
 * Array elements are split incrementally, so a multi-megabyte array is never
 * buffered in full: only the current element is held in memory.
 */
async function* parseJsonBatch(
  chunks: AsyncIterable<string>
): AsyncGenerator<ParsedBatchItem> {
  let phase: "start" | "array" | "single" | "done" = "start";
  let collecting = false;
  let element = "";
  let depth = 0;
  let inString = false;
  let escape = false;
  let single = "";
  let singleLine = 1;
  let elementLine = 1;
  let line = 1;
  let trailingReported = false;
  let firstChunk = true;

  for await (const chunk of chunks) {
    const text = firstChunk ? chunk.replace(/^\uFEFF/, "") : chunk;
    firstChunk = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (phase === "done") {
        if (!isWhitespace(char) && !trailingReported) {
          trailingReported = true;
          yield {
            kind: "error",
            line,
            destination: "",
            error: {
              code: "INVALID_JSON",
              message: "Unexpected trailing content after the JSON array.",
            },
          };
        }
      } else if (phase === "single") {
        single += char;
      } else if (phase === "start") {
        if (!isWhitespace(char)) {
          if (char === "[") {
            phase = "array";
          } else {
            phase = "single";
            single = char;
            singleLine = line;
          }
        }
      } else {
        // phase === "array"
        let startsElement = false;

        if (!collecting) {
          if (!isWhitespace(char)) {
            if (char === "]") {
              phase = "done";
            } else if (char === ",") {
              yield {
                kind: "error",
                line,
                destination: "",
                error: {
                  code: "INVALID_JSON",
                  message: `Empty array element at line ${line}.`,
                },
              };
            } else {
              collecting = true;
              startsElement = true;
              element = "";
              depth = 0;
              inString = false;
              escape = false;
              elementLine = line;
            }
          }
        }

        if (collecting) {
          if (startsElement) {
            element = char;
            if (char === '"') inString = true;
            else if (char === "{" || char === "[") depth = 1;
          } else if (inString) {
            element += char;
            if (escape) escape = false;
            else if (char === "\\") escape = true;
            else if (char === '"') inString = false;
          } else if (char === '"') {
            inString = true;
            element += char;
          } else if (char === "{" || char === "[") {
            depth++;
            element += char;
          } else if (char === "}" || char === "]") {
            if (depth > 0) {
              depth--;
              element += char;
            } else if (char === "]") {
              yield parseJsonValue(element, elementLine);
              collecting = false;
              phase = "done";
            } else {
              collecting = false;
              yield {
                kind: "error",
                line: elementLine,
                destination: "",
                error: {
                  code: "INVALID_JSON",
                  message: `Unexpected "}" in JSON array at line ${line}.`,
                },
              };
            }
          } else if (char === "," && depth === 0) {
            yield parseJsonValue(element, elementLine);
            collecting = false;
          } else {
            element += char;
          }
        }
      }

      if (char === "\n") line++;
    }
  }

  if (phase === "single") {
    yield parseJsonValue(single, singleLine);
  } else if (phase === "array") {
    yield {
      kind: "error",
      line,
      destination: "",
      error: {
        code: "INVALID_JSON",
        message: "Unexpected end of input: JSON array is not closed.",
      },
    };
  }
}

async function* parseChunks(
  chunks: AsyncIterable<string>,
  format: BatchFormat
): AsyncGenerator<ParsedBatchItem> {
  if (format === "csv") {
    yield* parseCsvBatch(chunks);
  } else if (format === "ndjson") {
    yield* parseNdjsonBatch(chunks);
  } else {
    yield* parseJsonBatch(chunks);
  }
}

/**
 * Detect a batch format from a file extension.
 *
 * Returns `null` when the extension is unknown so callers can fall back to
 * content sniffing.
 */
export function detectFormat(filePath: string | null): BatchFormat | null {
  if (!filePath) return null;

  const lower = filePath.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) return "ndjson";
  if (lower.endsWith(".json")) return "json";
  return null;
}

/**
 * Parse a batch input stream into rows / per-row errors.
 *
 * When `format` is omitted the format is sniffed from the first non-whitespace
 * character: `[` means a JSON array, `{` or `"` means NDJSON, anything else is
 * treated as CSV.
 */
export async function* parseBatchStream(
  stream: Readable,
  format?: BatchFormat
): AsyncGenerator<ParsedBatchItem> {
  if (format) {
    yield* parseChunks(decodeChunks(stream), format);
    return;
  }

  const iterator = decodeChunks(stream)[Symbol.asyncIterator]();
  let buffered = "";
  let detected: BatchFormat | null = null;

  for (;;) {
    const { value, done } = await iterator.next();
    if (done) break;
    buffered += value;

    const probe = buffered.replace(/^\uFEFF/, "").trimStart();
    if (probe.length > 0) {
      if (probe.startsWith("[")) detected = "json";
      else if (probe.startsWith("{") || probe.startsWith('"')) detected = "ndjson";
      else detected = "csv";
      break;
    }
  }

  if (detected === null) return;

  yield* parseChunks(withPrefix(buffered, iterator), detected);
}

/** Route a single parsed row and build its NDJSON record. */
export function processBatchRow(
  row: BatchRow,
  index: number,
  line: number | null,
  allowHashRouting = false
): NdjsonRecord {
  const input: RoutingInput = {
    destination: row.destination,
    memoType: row.memoType,
    memoValue: row.memoValue,
    sourceAccount: row.sourceAccount,
  };

  try {
    const result = extractRouting(input, { allowHashRouting });

    let status: BatchStatus = "ok";
    if (
      result.destinationError ||
      result.warnings.some((warning) => warning.severity === "error")
    ) {
      status = "error";
    } else if (result.warnings.length > 0) {
      status = "warning";
    }

    return {
      index,
      line,
      status,
      destination: row.destination,
      memoType: row.memoType,
      memoValue: row.memoValue,
      sourceAccount: row.sourceAccount,
      result,
    };
  } catch (error) {
    return {
      index,
      line,
      status: "error",
      destination: row.destination,
      memoType: row.memoType,
      memoValue: row.memoValue,
      sourceAccount: row.sourceAccount,
      error: { code: "ROUTING_ERROR", message: messageOf(error) },
    };
  }
}

/**
 * Process a batch stream end to end, yielding one NDJSON record per input row.
 *
 * Parse failures never abort the stream: they are emitted as `error` records
 * so operators keep receiving results for the remaining rows.
 */
export async function* processBatchStream(
  stream: Readable,
  options: { format?: BatchFormat; allowHashRouting?: boolean } = {}
): AsyncGenerator<NdjsonRecord> {
  let index = 0;

  for await (const item of parseBatchStream(stream, options.format)) {
    if (item.kind === "error") {
      yield {
        index: index++,
        line: item.line,
        status: "error",
        destination: item.destination,
        memoType: "none",
        memoValue: null,
        sourceAccount: null,
        error: item.error,
      };
      continue;
    }

    yield processBatchRow(
      item.row,
      index++,
      item.line,
      options.allowHashRouting === true
    );
  }
}

/** Whether a record should cause a non-zero process exit code. */
export function isBatchFailure(record: NdjsonRecord): boolean {
  return record.status === "error";
}
