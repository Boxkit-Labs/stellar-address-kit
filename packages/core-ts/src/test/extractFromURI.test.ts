import { describe, it, expect } from "vitest";
import { extractRoutingFromURI } from "../routing/extractFromURI";

const G = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const M = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG";
const HEX = "ab".repeat(32);
const B64 = Buffer.from(HEX, "hex").toString("base64");

describe("extractRoutingFromURI", () => {
  it("routes MEMO_ID", () => {
    const r = extractRoutingFromURI(
      `web+stellar:pay?destination=${G}&amount=10&memo=42&memo_type=MEMO_ID&asset_code=USDC&asset_issuer=${G}`
    );
    expect(r.uriError).toBeUndefined();
    expect(r.result?.routingId).toBe("42");
    expect(r.result?.routingSource).toBe("memo");
    expect(r.amount).toBe("10");
    expect(r.assetCode).toBe("USDC");
    expect(r.assetIssuer).toBe(G);
  });
  it("defaults to MEMO_TEXT and decodes percent-encoding", () => {
    const r = extractRoutingFromURI(`WEB+STELLAR:pay?destination=${G}&memo=%34%32`);
    expect(r.result?.routingId).toBe("42");
  });
  it("routes M-address", () => {
    const r = extractRoutingFromURI(`web+stellar:pay?destination=${M}`);
    expect(r.result?.routingSource).toBe("muxed");
  });
  it("maps MEMO_HASH base64 to hex", () => {
    const r = extractRoutingFromURI(
      `web+stellar:pay?destination=${G}&memo=${encodeURIComponent(B64)}&memo_type=MEMO_HASH`,
      { allowHashRouting: true }
    );
    expect(r.result?.routingId).toBe(HEX);
  });
  it("rejects bad hash encoding", () => {
    const r = extractRoutingFromURI(
      `web+stellar:pay?destination=${G}&memo=zz&memo_type=MEMO_RETURN`
    );
    expect(r.uriError?.code).toBe("INVALID_ENCODING");
  });
  it("error codes", () => {
    expect(extractRoutingFromURI("https://x").uriError?.code).toBe("INVALID_URI");
    expect(extractRoutingFromURI("").uriError?.code).toBe("INVALID_URI");
    expect(extractRoutingFromURI(null as any).uriError?.code).toBe("INVALID_URI");
    expect(extractRoutingFromURI("web+stellar:tx?xdr=AAAA").uriError?.code).toBe("UNSUPPORTED_OPERATION");
    expect(extractRoutingFromURI("web+stellar:pay?amount=1").uriError?.code).toBe("MISSING_DESTINATION");
    expect(extractRoutingFromURI(`web+stellar:pay?destination=%ZZ`).uriError?.code).toBe("INVALID_ENCODING");
    expect(extractRoutingFromURI(`web+stellar:pay?destination=${G}&memo=1&memo_type=BAD`).uriError?.code).toBe("INVALID_URI");
    expect(extractRoutingFromURI(`web+stellar:pay?destination=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`).uriError?.code).toBe("INVALID_URI");
  });
});
