/**
 * SEP-0029 memo requirement verification
 *
 *  1. isMemoRequiredFromAccountData – base64 data entry decoding
 *  2. fetchMemoRequirement          – Horizon request, 404, errors, timeout
 *  3. extractRoutingAsync           – MISSING_REQUIRED_MEMO and fail-open
 */

import { describe, it, expect, vi } from "vitest";
import { encodeMuxed } from "../muxed/encode";
import { extractRouting, ExtractRoutingError } from "../routing/extract";
import {
  DEFAULT_HORIZON_URL,
  FetchLike,
  MemoRequirementLookupError,
  MISSING_REQUIRED_MEMO_MESSAGE,
  extractRoutingAsync,
  fetchMemoRequirement,
  isMemoRequiredFromAccountData,
} from "../routing/memoRequirement";
import * as rootExports from "../index";
import type { RoutingInput } from "../routing/types";

const G_ADDRESS = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const M_ADDRESS = encodeMuxed(G_ADDRESS, 42n);
const C_ADDRESS = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

function input(
  destination: string,
  memoType = "none",
  memoValue: string | null = null,
  extra: Partial<RoutingInput> = {}
): RoutingInput {
  return { destination, memoType, memoValue, sourceAccount: null, ...extra };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function horizon(status: number, body: unknown) {
  return vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () =>
    jsonResponse(status, body)
  );
}

const MEMO_REQUIRED_ACCOUNT = {
  id: G_ADDRESS,
  data: { "config.memo_required": b64("1") },
};

const PLAIN_ACCOUNT = { id: G_ADDRESS, data: {} };

// ─── 1. Data entry decoding ───────────────────────────────────────────────────

describe("isMemoRequiredFromAccountData", () => {
  it("detects config.memo_required = 1", () => {
    expect(
      isMemoRequiredFromAccountData({ "config.memo_required": b64("1") })
    ).toBe(true);
  });

  it("detects the config.requiring_memo variant", () => {
    expect(
      isMemoRequiredFromAccountData({ "config.requiring_memo": b64("1") })
    ).toBe(true);
  });

  it("accepts 'true' case-insensitively and surrounding whitespace", () => {
    expect(
      isMemoRequiredFromAccountData({ "config.memo_required": b64(" TRUE ") })
    ).toBe(true);
  });

  it("treats 0, false and other values as not required", () => {
    for (const v of ["0", "false", "no", ""]) {
      expect(
        isMemoRequiredFromAccountData({ "config.memo_required": b64(v) })
      ).toBe(false);
    }
  });

  it("ignores unrelated keys, non-string values and invalid base64", () => {
    expect(isMemoRequiredFromAccountData({ "config.other": b64("1") })).toBe(
      false
    );
    expect(isMemoRequiredFromAccountData({ "config.memo_required": 1 })).toBe(
      false
    );
    expect(
      isMemoRequiredFromAccountData({ "config.memo_required": "%%%not-b64" })
    ).toBe(false);
  });

  it("handles missing or non-object data", () => {
    expect(isMemoRequiredFromAccountData(undefined)).toBe(false);
    expect(isMemoRequiredFromAccountData(null)).toBe(false);
    expect(isMemoRequiredFromAccountData("x")).toBe(false);
  });
});

// ─── 2. Horizon lookup ────────────────────────────────────────────────────────

describe("fetchMemoRequirement", () => {
  it("queries /accounts/{id} on the default public Horizon", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    await expect(fetchMemoRequirement(G_ADDRESS, { fetch })).resolves.toBe(
      true
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      `${DEFAULT_HORIZON_URL}/accounts/${G_ADDRESS}`
    );
  });

  it("uses a custom Horizon URL and strips trailing slashes", async () => {
    const fetch = horizon(200, PLAIN_ACCOUNT);
    await expect(
      fetchMemoRequirement(G_ADDRESS, {
        fetch,
        horizonUrl: "https://horizon-testnet.stellar.org//",
      })
    ).resolves.toBe(false);
    expect(fetch.mock.calls[0][0]).toBe(
      `https://horizon-testnet.stellar.org/accounts/${G_ADDRESS}`
    );
  });

  it("resolves false for an account Horizon does not know (404)", async () => {
    const fetch = horizon(404, { status: 404, title: "Resource Missing" });
    await expect(fetchMemoRequirement(G_ADDRESS, { fetch })).resolves.toBe(
      false
    );
  });

  it("resolves false when the record has no data field", async () => {
    const fetch = horizon(200, { id: G_ADDRESS });
    await expect(fetchMemoRequirement(G_ADDRESS, { fetch })).resolves.toBe(
      false
    );
  });

  it("rejects with MemoRequirementLookupError on a 5xx", async () => {
    const fetch = horizon(503, {});
    const err = await fetchMemoRequirement(G_ADDRESS, { fetch }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(MemoRequirementLookupError);
    expect(err.status).toBe(503);
  });

  it("rejects on a network failure", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(
      fetchMemoRequirement(G_ADDRESS, { fetch })
    ).rejects.toBeInstanceOf(MemoRequirementLookupError);
  });

  it("rejects when the body is not JSON", async () => {
    const fetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(
      fetchMemoRequirement(G_ADDRESS, { fetch })
    ).rejects.toBeInstanceOf(MemoRequirementLookupError);
  });

  it("aborts the request after timeoutMs", async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      });
    await expect(
      fetchMemoRequirement(G_ADDRESS, { fetch, timeoutMs: 10 })
    ).rejects.toBeInstanceOf(MemoRequirementLookupError);
  });

  it("honours a caller abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch: FetchLike = (_url, init) =>
      init?.signal?.aborted
        ? Promise.reject(new Error("aborted"))
        : Promise.resolve(jsonResponse(200, MEMO_REQUIRED_ACCOUNT));
    await expect(
      fetchMemoRequirement(G_ADDRESS, {
        fetch,
        signal: controller.signal,
        timeoutMs: 0,
      })
    ).rejects.toBeInstanceOf(MemoRequirementLookupError);
  });

  it("rejects when no fetch implementation is available", async () => {
    const original = globalThis.fetch;
    // @ts-expect-error simulate a runtime without fetch
    delete globalThis.fetch;
    try {
      await expect(fetchMemoRequirement(G_ADDRESS)).rejects.toBeInstanceOf(
        MemoRequirementLookupError
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ─── 3. extractRoutingAsync ───────────────────────────────────────────────────

describe("extractRoutingAsync", () => {
  it("appends MISSING_REQUIRED_MEMO when the account requires a memo and none is set", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const result = await extractRoutingAsync(input(G_ADDRESS), { fetch });

    expect(result.routingId).toBeNull();
    expect(result.routingSource).toBe("none");
    expect(result.destinationBaseAccount).toBe(G_ADDRESS);
    expect(result.warnings).toContainEqual({
      code: "MISSING_REQUIRED_MEMO",
      severity: "error",
      message: MISSING_REQUIRED_MEMO_MESSAGE,
    });
  });

  it("flags an unroutable memo (routingId null) on a memo-required account", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const result = await extractRoutingAsync(input(G_ADDRESS, "text", "hello"), {
      fetch,
    });
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toEqual(["MEMO_TEXT_UNROUTABLE", "MISSING_REQUIRED_MEMO"]);
  });

  it("adds nothing when a routing memo is present (no lookup made)", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const result = await extractRoutingAsync(input(G_ADDRESS, "id", "123"), {
      fetch,
    });
    expect(result.routingId).toBe("123");
    expect(result.warnings.map((w) => w.code)).not.toContain(
      "MISSING_REQUIRED_MEMO"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips the lookup for M-addresses", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const result = await extractRoutingAsync(input(M_ADDRESS), { fetch });
    expect(result.routingSource).toBe("muxed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips the lookup for a contract sender", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const result = await extractRoutingAsync(
      input(G_ADDRESS, "none", null, { sourceAccount: C_ADDRESS }),
      { fetch }
    );
    expect(result.destinationBaseAccount).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the sync result unchanged when the account does not require a memo", async () => {
    const fetch = horizon(200, PLAIN_ACCOUNT);
    const sync = extractRouting(input(G_ADDRESS));
    await expect(
      extractRoutingAsync(input(G_ADDRESS), { fetch })
    ).resolves.toEqual(sync);
  });

  it.each([
    ["HTTP 500", horizon(500, {})],
    [
      "network error",
      (async () => {
        throw new TypeError("fetch failed");
      }) as FetchLike,
    ],
  ])("fails open on %s", async (_label, fetch) => {
    const sync = extractRouting(input(G_ADDRESS, "text", "hello"));
    await expect(
      extractRoutingAsync(input(G_ADDRESS, "text", "hello"), { fetch })
    ).resolves.toEqual(sync);
  });

  it("fails open when a custom fetcher throws", async () => {
    const sync = extractRouting(input(G_ADDRESS));
    await expect(
      extractRoutingAsync(input(G_ADDRESS), {
        fetchMemoRequirement: async () => {
          throw new Error("indexer down");
        },
      })
    ).resolves.toEqual(sync);
  });

  it("uses a custom fetcher with the destination base account", async () => {
    const fetchMemoRequirement = vi.fn(async () => true);
    const fetch = horizon(200, PLAIN_ACCOUNT);
    const result = await extractRoutingAsync(input(G_ADDRESS), {
      fetchMemoRequirement,
      fetch,
    });
    expect(fetchMemoRequirement).toHaveBeenCalledWith(G_ADDRESS);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.warnings.map((w) => w.code)).toContain(
      "MISSING_REQUIRED_MEMO"
    );
  });

  it("keeps the error warning under minSeverityLevel 'error'", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const result = await extractRoutingAsync(
      input(G_ADDRESS, "text", "hello", { minSeverityLevel: "error" }),
      { fetch }
    );
    expect(result.warnings.map((w) => w.code)).toEqual([
      "MISSING_REQUIRED_MEMO",
    ]);
  });

  it("forwards allowHashRouting so a hash memo counts as routed", async () => {
    const fetch = horizon(200, MEMO_REQUIRED_ACCOUNT);
    const hash = "a".repeat(64);
    const result = await extractRoutingAsync(input(G_ADDRESS, "hash", hash), {
      fetch,
      allowHashRouting: true,
    });
    expect(result.routingId).toBe(hash);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates synchronous validation errors", async () => {
    await expect(
      extractRoutingAsync(input(""), { fetch: horizon(200, PLAIN_ACCOUNT) })
    ).rejects.toBeInstanceOf(ExtractRoutingError);
  });

  it("is exported from the package root", () => {
    expect(rootExports.extractRoutingAsync).toBe(extractRoutingAsync);
    expect(rootExports.fetchMemoRequirement).toBe(fetchMemoRequirement);
  });
});
