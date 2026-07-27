#!/usr/bin/env node
import { Command } from "commander";
import { extractRouting } from "./routing/extract";
import type { RoutingInput } from "./routing/types";

const program = new Command();

program
  .name("stellar-route")
  .description(
    "Debug Stellar deposit routing: test a destination address + memo combination and see the resulting RoutingResult."
  )
  .requiredOption("--dest <address>", "Destination Stellar address (G... or M...)")
  .option("--memo <value>", "Memo value (e.g. a MEMO_ID or MEMO_TEXT value)")
  .option("--type <type>", "Memo type: none, id, text, hash, return", "none")
  .parse(process.argv);

const opts = program.opts();

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