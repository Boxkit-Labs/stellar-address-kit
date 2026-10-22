#!/usr/bin/env node
import { Command } from "commander";
import { extractRouting } from "./routing/extract";
import type { RoutingInput } from "./routing/types";
import {
  detectFormat,
  openInputStream,
  parseCsvStream,
  parseJsonStream,
  processRows,
} from "./cli/batch";
import { writeNdjson } from "./cli/ndjson";

const program = new Command();

program
  .name("stellar-route")
  .description(
    "Debug Stellar deposit routing: test a destination address + memo combination and see the resulting RoutingResult."
  )
  .option("--dest <address>", "Destination Stellar address (G... or M...)")
  .option("--memo <value>", "Memo value (e.g. a MEMO_ID or MEMO_TEXT value)")
  .option("--type <type>", "Memo type: none, id, text, hash, return", "none")
  .option("--file <path>", "Read batch inputs from a CSV or JSON file")
  .option("--stdin", "Read batch inputs from stdin")
  .parse(process.argv);

const opts = program.opts();

async function runSingle(): Promise<void> {
  const input: RoutingInput = {
    destination: opts.dest,
    memoType: opts.type,
    memoValue: opts.memo ?? null,
    sourceAccount: null,
  };

  try {
    const result = extractRouting(input);
    console.log(
      JSON.stringify(
        result,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred.");
    }
    process.exitCode = 1;
  }
}

async function runBatch(filePath: string | null): Promise<void> {
  const format = detectFormat(filePath);
  const stream = openInputStream(filePath);
  const parser = format === "csv" ? parseCsvStream(stream) : parseJsonStream(stream);

  const rows: unknown[] = [];
  for await (const row of parser) {
    rows.push(row);
  }

  const { records, hasErrors } = processRows(rows);
  for (const record of records) {
    writeNdjson(process.stdout, record);
  }

  if (hasErrors) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  if (opts.file || opts.stdin) {
    await runBatch(opts.file ?? null);
    return;
  }

  if (!opts.dest) {
    console.error("Error: either --dest or --file/--stdin is required.");
    process.exitCode = 1;
    return;
  }

  await runSingle();
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("An unknown error occurred.");
  }
  process.exitCode = 1;
});
