/**
 * Batch CLI + NDJSON streaming test suite (issue #356).
 *
 * Covers the three supported input formats (CSV, JSON array, NDJSON), the
 * shared field-extraction aliases, per-record error handling, and the
 * sanitized NDJSON writer.
 */

import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";

import {
  canonicalField,
  detectFormat,
  isBatchFailure,
  normalizeMemoType,
  processBatchStream,
  rowFromObject,
  type BatchFormat,
} from "../cli/batch";
import {
  toNdjsonLine,
  writeNdjson,
  type NdjsonRecord,
} from "../cli/ndjson";

// Well-known G-address from spec/vectors.json (muxed_encode cases).
const G_ADDRESS = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
// Structurally G-prefixed but not a valid StrKey: exercises destinationError.
const BROKEN_G_ADDRESS = "GABC";

async function collect(
  chunks: string[],
  format?: BatchFormat
): Promise<NdjsonRecord[]> {
  const records: NdjsonRecord[] = [];
  for await (const record of processBatchStream(Readable.from(chunks), {
    format,
  })) {
    records.push(record);
  }
  return records;
}

function recordWithStatus(status: NdjsonRecord["status"]): NdjsonRecord {
  return {
    index: 0,
    line: 1,
    status,
    destination: G_ADDRESS,
    memoType: "none",
    memoValue: null,
    sourceAccount: null,
  };
}

describe("batch field extraction", () => {
  it("maps CSV headers and JSON keys onto canonical fields", () => {
    expect(canonicalField("Address")).toBe("destination");
    expect(canonicalField("stellar-address")).toBe("destination");
    expect(canonicalField("destination_address")).toBe("destination");
    expect(canonicalField("memoType")).toBe("memoType");
    expect(canonicalField("memo_type")).toBe("memoType");
    expect(canonicalField("source-account")).toBe("sourceAccount");
    expect(canonicalField("sender")).toBe("sourceAccount");
    expect(canonicalField("routing_id")).toBe("memoValue");
    expect(canonicalField("unrelated")).toBeNull();
  });

  it("infers a memo type when the row supplies a memo without one", () => {
    expect(normalizeMemoType("", "42")).toBe("text");
    expect(normalizeMemoType("", null)).toBe("none");
    expect(normalizeMemoType("MEMO_ID", null)).toBe("id");
    expect(normalizeMemoType("hash", null)).toBe("hash");
    expect(normalizeMemoType("return", null)).toBe("return");
  });

  it("reports a missing destination with a structured error code", () => {
    const item = rowFromObject({ memo: "1" }, 9);

    expect(item.kind).toBe("error");
    if (item.kind === "error") {
      expect(item.error.code).toBe("MISSING_DESTINATION");
      expect(item.line).toBe(9);
    }
  });

  it("rejects non-object JSON records", () => {
    const item = rowFromObject([1, 2, 3], 4);

    expect(item.kind).toBe("error");
    if (item.kind === "error") {
      expect(item.error.code).toBe("INVALID_RECORD");
    }
  });
});

describe("NDJSON input", () => {
  it("streams one record per line with statuses and error codes", async () => {
    const records = await collect([
      `{"address":"${G_ADDRESS}","memo":"100","memo_type":"id"}\n`,
      `{"destination":"${BROKEN_G_ADDRESS}"}\n`,
      "not json\n",
    ]);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      index: 0,
      line: 1,
      status: "ok",
      destination: G_ADDRESS,
      memoType: "id",
      memoValue: "100",
    });
    expect(records[0].result?.routingId).toBe("100");
    expect(records[0].result?.routingSource).toBe("memo");

    expect(records[1]).toMatchObject({ index: 1, line: 2, status: "error" });
    expect(records[1].result?.destinationError?.code).toBe("INVALID_LENGTH");

    expect(records[2]).toMatchObject({ index: 2, line: 3, status: "error" });
    expect(records[2].error?.code).toBe("INVALID_JSON");
  });

  it("ignores blank lines", async () => {
    const records = await collect([
      "\n",
      `{"destination":"${G_ADDRESS}"}\n`,
      "\n",
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].line).toBe(2);
  });
});

describe("CSV input", () => {
  it("handles quoted fields, blank lines, and missing destinations", async () => {
    const records = await collect([
      "destination,memo,memo_type,source_account\r\n",
      `${G_ADDRESS},"1,2",text,\r\n`,
      "\r\n",
      ",42,id,GSRC\r\n",
      `${G_ADDRESS},100,id,GSRC\r\n`,
    ]);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      index: 0,
      line: 2,
      status: "warning",
      memoValue: "1,2",
      sourceAccount: null,
    });
    expect(records[1]).toMatchObject({ index: 1, line: 4, status: "error" });
    expect(records[1].error?.code).toBe("MISSING_DESTINATION");
    expect(records[2]).toMatchObject({
      index: 2,
      line: 5,
      status: "ok",
      memoType: "id",
      memoValue: "100",
      sourceAccount: "GSRC",
    });
    expect(records[2].result?.routingId).toBe("100");
  });

  it("keeps quoted fields intact across chunk boundaries", async () => {
    const records = await collect([
      `destination,memo\n${G_ADDRESS},"say ""hi`,
      `"",here"\n`,
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].memoValue).toBe('say "hi",here');
  });

  it("infers text routing for a memo column without a memo type", async () => {
    const records = await collect([
      "destination,memo\n",
      `${G_ADDRESS},100\n`,
    ]);

    expect(records[0]).toMatchObject({
      status: "ok",
      memoType: "text",
      memoValue: "100",
    });
  });

  it("reports a CSV header without a destination column", async () => {
    const records = await collect(["foo,bar\n", "1,2\n"]);

    expect(records).toHaveLength(1);
    expect(records[0].error?.code).toBe("INVALID_RECORD");
  });

  it("reports an unterminated quoted field", async () => {
    const records = await collect([`destination,memo\n${G_ADDRESS},"oops\n`]);

    expect(records.some((record) => record.error?.code === "INVALID_RECORD")).toBe(
      true
    );
  });
});

describe("JSON array input", () => {
  it("streams elements with source line numbers", async () => {
    const records = await collect(
      [
        "[\n",
        `  {"destination":"${G_ADDRESS}","memo_type":"id","memo":"7"},\n`,
        `  {"address":"${G_ADDRESS}"}\n`,
        "]\n",
      ],
      "json"
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      line: 2,
      status: "ok",
      memoType: "id",
      memoValue: "7",
    });
    expect(records[1]).toMatchObject({
      line: 3,
      status: "ok",
      memoType: "none",
      memoValue: null,
    });
  });

  it("keeps streaming after an invalid element", async () => {
    const records = await collect(
      [
        `[{"destination":"${G_ADDRESS}"},{"destination":},{"destination":"${G_ADDRESS}"}]`,
      ],
      "json"
    );

    expect(records).toHaveLength(3);
    expect(records[1].status).toBe("error");
    expect(records[1].error?.code).toBe("INVALID_JSON");
    expect(records[2].status).toBe("ok");
  });

  it("reports an unterminated array", async () => {
    const records = await collect(
      [`[{"destination":"${G_ADDRESS}"`],
      "json"
    );

    expect(records).toHaveLength(1);
    expect(records[0].error?.code).toBe("INVALID_JSON");
  });
});

describe("format detection", () => {
  it("uses file extensions when available", () => {
    expect(detectFormat("deposits.CSV")).toBe("csv");
    expect(detectFormat("deposits.json")).toBe("json");
    expect(detectFormat("deposits.ndjson")).toBe("ndjson");
    expect(detectFormat("deposits.jsonl")).toBe("ndjson");
    expect(detectFormat("deposits.txt")).toBeNull();
    expect(detectFormat(null)).toBeNull();
  });

  it("sniffs JSON arrays, NDJSON, and CSV from content", async () => {
    const json = await collect([`[{"destination":"${G_ADDRESS}"}]`]);
    const ndjson = await collect([`{"destination":"${G_ADDRESS}"}\n`]);
    const csv = await collect([`destination\n${G_ADDRESS}\n`]);

    expect(json[0].destination).toBe(G_ADDRESS);
    expect(ndjson[0].destination).toBe(G_ADDRESS);
    expect(csv[0].destination).toBe(G_ADDRESS);
  });
});

describe("exit-code aggregation", () => {
  it("flags only error-status records", () => {
    expect(isBatchFailure(recordWithStatus("ok"))).toBe(false);
    expect(isBatchFailure(recordWithStatus("warning"))).toBe(false);
    expect(isBatchFailure(recordWithStatus("error"))).toBe(true);
  });

  it("treats unroutable destinations as failures", async () => {
    const records = await collect([
      "destination\n",
      "not-an-address\n",
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("error");
    expect(records[0].error?.code).toBe("ROUTING_ERROR");
  });
});

describe("NDJSON writer", () => {
  it("serializes BigInt routing ids as strings", () => {
    const record: NdjsonRecord = {
      index: 0,
      line: 1,
      status: "ok",
      destination: G_ADDRESS,
      memoType: "id",
      memoValue: "18446744073709551615",
      sourceAccount: null,
      result: {
        destinationBaseAccount: G_ADDRESS,
        routingId: BigInt("18446744073709551615"),
        routingSource: "memo",
        warnings: [],
      },
    };

    const line = toNdjsonLine(record);

    expect(line).toContain('"routingId":"18446744073709551615"');
    expect(line).not.toContain("\n");
  });

  it("writes one line per record and surfaces backpressure", () => {
    const writes: string[] = [];
    const sink = {
      write(chunk: string) {
        writes.push(chunk);
        return false;
      },
    };

    const accepted = writeNdjson(
      sink as unknown as NodeJS.WritableStream,
      recordWithStatus("ok")
    );

    expect(writes).toHaveLength(1);
    expect(writes[0].endsWith("\n")).toBe(true);
    expect(accepted).toBe(false);
  });
});
