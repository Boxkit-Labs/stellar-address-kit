#!/usr/bin/env node
import { once } from "node:events";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { Command } from "commander";
import { extractRouting } from "./routing/extract";
import type { RoutingInput } from "./routing/types";
import {
  detectFormat,
  isBatchFailure,
  processBatchStream,
  type BatchFormat,
} from "./cli/batch";
import { writeNdjson } from "./cli/ndjson";

const BATCH_FORMATS: BatchFormat[] = ["csv", "json", "ndjson"];

interface CliOptions {
  dest?: string;
  memo?: string;
  type: string;
  file?: string;
  stdin?: boolean;
  format?: string;
  allowHashRouting?: boolean;
}

const program = new Command();

program
  .name("stellar-route")
  .description(
    "Debug Stellar deposit routing: inspect a single destination address + memo, or stream a batch of records (CSV, JSON array, NDJSON) and emit NDJSON results."
  )
  .option("--dest <address>", "Destination Stellar address (G... or M...)")
  .option("--memo <value>", "Memo value (e.g. a MEMO_ID or MEMO_TEXT value)")
  .option("--type <type>", "Memo type: none, id, text, hash, return", "none")
  .option(
    "--file <path>",
    "Batch input file: CSV, JSON array, or NDJSON (use - to read stdin)"
  )
  .option("--stdin", "Read batch input from stdin")
  .option(
    "--format <format>",
    "Batch input format: csv, json, or ndjson (default: auto-detect)"
  )
  .option(
    "--allow-hash-routing",
    "Treat 32-byte hex MEMO_HASH / MEMO_RETURN values as routing IDs"
  )
  .parse(process.argv);

const opts = program.opts() as CliOptions;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}

function parseFormat(value: string | undefined): BatchFormat | undefined {
  if (!value || value.toLowerCase() === "auto") {
    return undefined;
  }

  const normalized = value.toLowerCase() as BatchFormat;
  if (!BATCH_FORMATS.includes(normalized)) {
    throw new Error(
      `Unsupported --format "${value}". Expected one of: csv, json, ndjson.`
    );
  }
  return normalized;
}

/** Existing single-address behaviour: pretty-print one RoutingResult. */
function runSingle(options: CliOptions): number {
  const input: RoutingInput = {
    destination: options.dest as string,
    memoType: options.type,
    memoValue: options.memo ?? null,
    sourceAccount: null,
  };

  try {
    const result = extractRouting(input, {
      allowHashRouting: options.allowHashRouting === true,
    });
    console.log(
      JSON.stringify(
        result,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
    return 0;
  } catch (error) {
    console.error(`Error: ${messageOf(error)}`);
    return 1;
  }
}

/** Batch mode: stream NDJSON records to stdout, exit non-zero on failures. */
async function runBatch(options: CliOptions): Promise<number> {
  const filePath = options.file && options.file !== "-" ? options.file : null;
  const format = parseFormat(options.format) ?? detectFormat(filePath) ?? undefined;

  const stream: Readable = filePath
    ? createReadStream(filePath, { encoding: "utf8" })
    : process.stdin;

  let failures = 0;

  try {
    for await (const record of processBatchStream(stream, {
      format,
      allowHashRouting: options.allowHashRouting === true,
    })) {
      if (isBatchFailure(record)) {
        failures++;
      }
      if (!writeNdjson(process.stdout, record)) {
        await once(process.stdout, "drain");
      }
    }
  } catch (error) {
    console.error(`Error: ${messageOf(error)}`);
    return 1;
  }

  return failures > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const batchMode = Boolean(opts.file) || opts.stdin === true;

  if (opts.file && opts.stdin) {
    console.error("Error: use either --file or --stdin, not both.");
    return 1;
  }

  if (batchMode) {
    if (opts.dest) {
      console.error(
        "Error: use --dest for a single address, or --file/--stdin for batch mode, not both."
      );
      return 1;
    }
    return runBatch(opts);
  }

  if (!opts.dest) {
    console.error(
      "Error: --dest is required unless --file or --stdin is provided."
    );
    return 1;
  }

  return runSingle(opts);
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`Error: ${messageOf(error)}`);
    process.exitCode = 1;
  });
