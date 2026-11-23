/**
 * Unit tests for SEP-0002 federation address resolution.
 * All HTTP is mocked through the injectable `fetchImpl`; no network is used.
 */

import { describe, it, expect, vi } from "vitest";
import {
  FederationError,
  FederationFetch,
  parseFederationAddress,
  resolveFederationAddress,
} from "../routing/federation";
import { extractRouting } from "../routing/extract";

const G = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const M = "MBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OAAAAAAAAAAAPOGVY";
const ADDRESS = "alice*example.com";
const TOML_URL = "https://example.com/.well-known/stellar.toml";
const FED_SERVER = "https://fed.example.com/federation";
const TOML = `FEDERATION_SERVER="${FED_SERVER}"\n`;

const HASH_HEX = "ab".repeat(32);
const HASH_B64 = Buffer.from(HASH_HEX, "hex").toString("base64");

function res(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

/** Builds a mock fetch that serves a toml and a federation JSON body. */
function mockFetch(opts: {
  toml?: string | number | Error;
  fed?: unknown | number | Error;
}) {
  const calls: string[] = [];
  const fetchImpl: FederationFetch = vi.fn(async (url: string) => {
    calls.push(url);
    const isToml = url === TOML_URL;
    const v = isToml ? opts.toml : opts.fed;
    if (v instanceof Error) throw v;
    if (typeof v === "number") return res("", v);
    if (isToml) return res((v as string) ?? "", 200);
    return res(typeof v === "string" ? v : JSON.stringify(v), 200);
  });
  return { fetchImpl, calls };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(FederationError);
    return (e as FederationError).code;
  }
  throw new Error("expected rejection");
}

describe("parseFederationAddress()", () => {
  it("parses a valid address and lowercases the domain", () => {
    expect(parseFederationAddress("Bob*Example.COM")).toEqual({
      name: "Bob",
      domain: "example.com",
    });
  });

  it("allows common name characters", () => {
    expect(parseFederationAddress("a.b+c_d-e@f*example.org").name).toBe("a.b+c_d-e@f");
  });

  it.each([
    ["empty string", ""],
    ["no asterisk", "alice.example.com"],
    ["two asterisks", "a*b*example.com"],
    ["empty name", "*example.com"],
    ["empty domain", "alice*"],
    ["whitespace in name", "al ice*example.com"],
    ["'>' in name", "al>ice*example.com"],
    ["control char in name", "al\u0000ice*example.com"],
    ["name too long", `${"a".repeat(65)}*example.com`],
    ["single-label domain", "alice*localhost"],
    ["domain with port", "alice*example.com:8080"],
    ["domain with path", "alice*example.com/evil"],
    ["domain with userinfo", "alice*evil@example.com"],
    ["IPv4 literal domain", "alice*127.0.0.1"],
    ["IPv6 literal domain", "alice*[::1]"],
    ["domain with leading hyphen label", "alice*-bad.example.com"],
    ["address too long", `a*${"b".repeat(400)}.com`],
  ])("rejects %s", (_label, input) => {
    expect(() => parseFederationAddress(input)).toThrowError(FederationError);
    try {
      parseFederationAddress(input);
    } catch (e) {
      expect((e as FederationError).code).toBe("INVALID_FEDERATION_ADDRESS");
    }
  });

  it("rejects non-string input", () => {
    expect(() => parseFederationAddress(undefined as unknown as string)).toThrowError(
      FederationError
    );
  });
});

describe("resolveFederationAddress() – success", () => {
  it("resolves to a RoutingInput with no memo", async () => {
    const { fetchImpl, calls } = mockFetch({ toml: TOML, fed: { account_id: G } });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    expect(input).toEqual({
      destination: G,
      memoType: "none",
      memoValue: null,
      sourceAccount: null,
    });
    expect(calls[0]).toBe(TOML_URL);
    const fed = new URL(calls[1]);
    expect(fed.origin + fed.pathname).toBe(FED_SERVER);
    expect(fed.searchParams.get("q")).toBe(ADDRESS);
    expect(fed.searchParams.get("type")).toBe("name");
  });

  it("returns an id memo, normalized", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G, memo_type: "id", memo: "0042" },
    });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    expect(input.memoType).toBe("id");
    expect(input.memoValue).toBe("42");
  });

  it("keeps a uint64 max id memo exact", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G, memo_type: "id", memo: "18446744073709551615" },
    });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    expect(input.memoValue).toBe("18446744073709551615");
  });

  it("returns a text memo", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G, memo_type: "text", memo: "invoice-7" },
    });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    expect(input).toMatchObject({ memoType: "text", memoValue: "invoice-7" });
  });

  it("converts a base64 hash memo to hex", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G, memo_type: "hash", memo: HASH_B64 },
    });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    expect(input).toMatchObject({ memoType: "hash", memoValue: HASH_HEX });
  });

  it("accepts an M-address account_id", async () => {
    const { fetchImpl } = mockFetch({ toml: TOML, fed: { account_id: M } });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    expect(input.destination).toBe(M);
  });

  it("uppercases a lowercase account_id", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G.toLowerCase() },
    });
    expect((await resolveFederationAddress(ADDRESS, { fetchImpl })).destination).toBe(G);
  });

  it("accepts a matching stellar_address (case-insensitive)", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G, stellar_address: "ALICE*EXAMPLE.COM" },
    });
    await expect(resolveFederationAddress(ADDRESS, { fetchImpl })).resolves.toBeTruthy();
  });

  it("parses FEDERATION_SERVER among other keys, comments and single quotes", async () => {
    const toml = `# comment\nVERSION="2.0.0"\nFEDERATION_SERVER='${FED_SERVER}' # trailing\n[[CURRENCIES]]\ncode="X"\n`;
    const { fetchImpl } = mockFetch({ toml, fed: { account_id: G } });
    await expect(resolveFederationAddress(ADDRESS, { fetchImpl })).resolves.toBeTruthy();
  });

  it("feeds directly into extractRouting", async () => {
    const { fetchImpl } = mockFetch({
      toml: TOML,
      fed: { account_id: G, memo_type: "id", memo: "123" },
    });
    const input = await resolveFederationAddress(ADDRESS, { fetchImpl });
    const routing = extractRouting(input);
    expect(routing.destinationBaseAccount).toBe(G);
    expect(routing.routingSource).toBe("memo");
    expect(String(routing.routingId)).toBe("123");
  });

  it("never follows redirects and sends an abort signal", async () => {
    const { fetchImpl } = mockFetch({ toml: TOML, fed: { account_id: G } });
    await resolveFederationAddress(ADDRESS, { fetchImpl });
    for (const call of (fetchImpl as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toMatchObject({ redirect: "error" });
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe("resolveFederationAddress() – errors", () => {
  it("INVALID_FEDERATION_ADDRESS makes no network call", async () => {
    const { fetchImpl } = mockFetch({});
    expect(await codeOf(resolveFederationAddress("nope", { fetchImpl }))).toBe(
      "INVALID_FEDERATION_ADDRESS"
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("STELLAR_TOML_FETCH_FAILED on network error", async () => {
    const { fetchImpl } = mockFetch({ toml: new Error("ECONNREFUSED") });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "STELLAR_TOML_FETCH_FAILED"
    );
  });

  it("STELLAR_TOML_FETCH_FAILED on HTTP 404", async () => {
    const { fetchImpl } = mockFetch({ toml: 404 });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "STELLAR_TOML_FETCH_FAILED"
    );
  });

  it("STELLAR_TOML_FETCH_FAILED on oversized body", async () => {
    const { fetchImpl } = mockFetch({ toml: "#".repeat(200 * 1024) });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "STELLAR_TOML_FETCH_FAILED"
    );
  });

  it("STELLAR_TOML_FETCH_FAILED on timeout", async () => {
    const fetchImpl: FederationFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    expect(
      await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl, timeoutMs: 10 }))
    ).toBe("STELLAR_TOML_FETCH_FAILED");
  });

  it("STELLAR_TOML_FETCH_FAILED when no fetch is available", async () => {
    vi.stubGlobal("fetch", undefined);
    try {
      expect(await codeOf(resolveFederationAddress(ADDRESS))).toBe(
        "STELLAR_TOML_FETCH_FAILED"
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["missing FEDERATION_SERVER", 'VERSION="2.0.0"\n'],
    ["empty toml", ""],
    ["http (non-https) server", 'FEDERATION_SERVER="http://fed.example.com/f"'],
    ["localhost server", 'FEDERATION_SERVER="https://localhost/f"'],
    ["IPv4 server", 'FEDERATION_SERVER="https://10.0.0.1/f"'],
    ["IPv6 server", 'FEDERATION_SERVER="https://[::1]/f"'],
    ["server with credentials", 'FEDERATION_SERVER="https://u:p@fed.example.com/f"'],
    ["unparseable server", 'FEDERATION_SERVER="not a url"'],
    ["key only inside a table", '[DOCUMENTATION]\nFEDERATION_SERVER="https://fed.example.com/f"'],
  ])("FEDERATION_SERVER_NOT_FOUND: %s", async (_label, toml) => {
    const { fetchImpl, calls } = mockFetch({ toml });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "FEDERATION_SERVER_NOT_FOUND"
    );
    expect(calls).toHaveLength(1);
  });

  it("FEDERATION_LOOKUP_FAILED on HTTP 404", async () => {
    const { fetchImpl } = mockFetch({ toml: TOML, fed: 404 });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "FEDERATION_LOOKUP_FAILED"
    );
  });

  it("FEDERATION_LOOKUP_FAILED on network error", async () => {
    const { fetchImpl } = mockFetch({ toml: TOML, fed: new Error("boom") });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "FEDERATION_LOOKUP_FAILED"
    );
  });

  it.each([
    ["non-JSON body", "<html>"],
    ["JSON array", []],
    ["JSON null", "null"],
    ["missing account_id", {}],
    ["non-string account_id", { account_id: 5 }],
    ["invalid account_id", { account_id: "GABC" }],
    ["secret key as account_id", { account_id: "SAWAIYNFPJI74KRGDL27V7GVMZ4WSTQRCWL6C67MAVXXVWU33MAE3PAD" }],
    ["mismatched stellar_address", { account_id: G, stellar_address: "bob*example.com" }],
    ["memo without memo_type", { account_id: G, memo: "x" }],
    ["unknown memo_type", { account_id: G, memo_type: "return", memo: HASH_B64 }],
    ["memo_type without memo", { account_id: G, memo_type: "text" }],
    ["numeric id memo", { account_id: G, memo_type: "id", memo: 42 }],
    ["non-numeric id memo", { account_id: G, memo_type: "id", memo: "abc" }],
    ["id memo above uint64", { account_id: G, memo_type: "id", memo: "18446744073709551616" }],
    ["text memo over 28 bytes", { account_id: G, memo_type: "text", memo: "x".repeat(29) }],
    ["hash memo bad base64", { account_id: G, memo_type: "hash", memo: "!!!" }],
    ["hash memo wrong length", { account_id: G, memo_type: "hash", memo: "AAAA" }],
  ])("INVALID_FEDERATION_RESPONSE: %s", async (_label, fed) => {
    const { fetchImpl } = mockFetch({ toml: TOML, fed });
    expect(await codeOf(resolveFederationAddress(ADDRESS, { fetchImpl }))).toBe(
      "INVALID_FEDERATION_RESPONSE"
    );
  });
});
