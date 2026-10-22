import { describe, expect, it, vi } from "vitest";
import { extractRouting } from "./extract";
import {
  FederationResolutionError,
  resolveFederationAddress,
} from "./federation";

const FEDERATION_ADDRESS = "bob*example.com";
const FEDERATION_SERVER = "https://federation.example.com/federation";
const ACCOUNT_ID = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  } as Response;
}

function toml(server = FEDERATION_SERVER): string {
  return [
    "# Example stellar.toml",
    'NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"',
    `FEDERATION_SERVER = "${server}"`,
    "",
  ].join("\n");
}

function fetchMock(...responses: Array<Response | Error | string>) {
  const mock = vi.fn<typeof fetch>();
  for (const item of responses) {
    if (item instanceof Error) {
      mock.mockRejectedValueOnce(item);
    } else {
      mock.mockResolvedValueOnce(
        typeof item === "string" ? response(item) : item
      );
    }
  }
  return mock;
}

function lookupUrl(mock: ReturnType<typeof fetchMock>): URL {
  return new URL(String(mock.mock.calls[1][0]));
}

describe("resolveFederationAddress", () => {
  it("resolves an address without a memo to a normalized RoutingInput", async () => {
    const fetchImpl = fetchMock(toml(), response({ account_id: ACCOUNT_ID }));

    const input = await resolveFederationAddress(FEDERATION_ADDRESS, {
      fetchImpl,
    });

    expect(input).toEqual({
      destination: ACCOUNT_ID,
      memoType: "none",
      memoValue: null,
      sourceAccount: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://example.com/.well-known/stellar.toml"
    );
    expect(lookupUrl(fetchImpl).searchParams.get("q")).toBe(FEDERATION_ADDRESS);
    expect(lookupUrl(fetchImpl).searchParams.get("type")).toBe("name");
  });

  it("maps a provided memo_type to a lowercase routing memo type", async () => {
    const fetchImpl = fetchMock(
      toml(),
      response({ account_id: ACCOUNT_ID, memo: "12345", memo_type: "ID" })
    );

    const input = await resolveFederationAddress(FEDERATION_ADDRESS, {
      fetchImpl,
    });

    expect(input.memoType).toBe("id");
    expect(input.memoValue).toBe("12345");
  });

  it("defaults memo_type to text when memo is present but memo_type is missing", async () => {
    const fetchImpl = fetchMock(
      toml(),
      response({ account_id: ACCOUNT_ID, memo: "hello" })
    );

    const input = await resolveFederationAddress(FEDERATION_ADDRESS, {
      fetchImpl,
    });

    expect(input.memoType).toBe("text");
    expect(input.memoValue).toBe("hello");
  });

  it("keeps existing query parameters on the federation server URL", async () => {
    const fetchImpl = fetchMock(
      toml("https://federation.example.com/api?network=testnet"),
      response({ account_id: ACCOUNT_ID })
    );

    await resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl });

    const url = lookupUrl(fetchImpl);
    expect(url.origin + url.pathname).toBe(
      "https://federation.example.com/api"
    );
    expect(url.searchParams.get("network")).toBe("testnet");
    expect(url.searchParams.get("q")).toBe(FEDERATION_ADDRESS);
    expect(url.searchParams.get("type")).toBe("name");
  });

  it("accepts single-quoted TOML values and surrounding whitespace", async () => {
    const fetchImpl = fetchMock(
      `  FEDERATION_SERVER = '${FEDERATION_SERVER}'  \n`,
      response({ account_id: ACCOUNT_ID })
    );

    await resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns a RoutingInput that extractRouting can consume", async () => {
    const fetchImpl = fetchMock(
      toml(),
      response({ account_id: ACCOUNT_ID, memo: "42", memo_type: "id" })
    );

    const input = await resolveFederationAddress(FEDERATION_ADDRESS, {
      fetchImpl,
    });
    const result = extractRouting(input);

    expect(result.destinationBaseAccount).toBe(ACCOUNT_ID);
    expect(result.routingId).toBe("42");
    expect(result.routingSource).toBe("memo");
  });

  it.each(["", "bob", "*example.com", "bob*", "bob*exa mple.com", "bob*example"])(
    "rejects malformed federation address %j",
    async (address: string) => {
      const fetchImpl = fetchMock();

      await expect(
        resolveFederationAddress(address, { fetchImpl })
      ).rejects.toMatchObject({
        name: "FederationResolutionError",
        code: "INVALID_FEDERATION_ADDRESS",
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("rejects when stellar.toml has no FEDERATION_SERVER", async () => {
    const fetchImpl = fetchMock(
      response('NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"\n')
    );

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      name: "FederationResolutionError",
      code: "FEDERATION_SERVER_NOT_FOUND",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects when stellar.toml cannot be fetched", async () => {
    const fetchImpl = fetchMock(new Error("network down"));

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      code: "STELLAR_TOML_FETCH_FAILED",
    });
  });

  it("rejects when stellar.toml responds with a non-OK status", async () => {
    const fetchImpl = fetchMock(response("not found", false, 404));

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      code: "STELLAR_TOML_FETCH_FAILED",
    });
  });

  it("rejects a FEDERATION_SERVER that does not use https", async () => {
    const fetchImpl = fetchMock(
      toml("http://federation.example.com/federation"),
      response({ account_id: ACCOUNT_ID })
    );

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      code: "INVALID_FEDERATION_RESPONSE",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects when the federation lookup responds with a non-OK status", async () => {
    const fetchImpl = fetchMock(toml(), response("error", false, 500));

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      code: "FEDERATION_LOOKUP_FAILED",
    });
  });

  it("rejects when the federation lookup returns invalid JSON", async () => {
    const fetchImpl = fetchMock(toml(), response("not json"));

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      code: "INVALID_FEDERATION_RESPONSE",
    });
  });

  it("rejects when the federation lookup is missing account_id", async () => {
    const fetchImpl = fetchMock(toml(), response({ memo: "1" }));

    await expect(
      resolveFederationAddress(FEDERATION_ADDRESS, { fetchImpl })
    ).rejects.toMatchObject({
      name: "FederationResolutionError",
      code: "INVALID_FEDERATION_RESPONSE",
    });
  });
});
