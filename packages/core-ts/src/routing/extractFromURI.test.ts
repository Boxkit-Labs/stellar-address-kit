import { isSuccessfulURIResult } from "../src/lib/extractRoutingFromURI";
import { extractRoutingFromURI } from '../lib/extractRoutingFromURI';

describe("extractRoutingFromURI", () => {
  describe("scheme validation", () => {
    it("rejects URIs without web+stellar scheme", () => {
      const result = extractRoutingFromURI("https://example.com/pay?destination=G...");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_URI");
      }
    });

    it("rejects empty string", () => {
      const result = extractRoutingFromURI("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_URI");
      }
    });
  });

  describe("operation validation", () => {
    it("rejects unsupported 'tx' operation", () => {
      const result = extractRoutingFromURI(
        "web+stellar:tx?xdr=AAAA..."
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNSUPPORTED_OPERATION");
      }
    });

    it("rejects unknown operations", () => {
      const result = extractRoutingFromURI(
        "web+stellar:unknown?destination=G..."
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNSUPPORTED_OPERATION");
      }
    });
  });

  describe("destination validation", () => {
    it("rejects missing destination", () => {
      const result = extractRoutingFromURI("web+stellar:pay?amount=100");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("MISSING_DESTINATION");
      }
    });

    it("rejects empty destination", () => {
      const result = extractRoutingFromURI("web+stellar:pay?destination=");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("MISSING_DESTINATION");
      }
    });
  });

  describe("successful parsing with G-address", () => {
    it("parses basic pay URI with destination only", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO"
      );
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.rawParams.destination).toBe("GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO");
        expect(result.rawParams.memo).toBeUndefined();
        expect(result.rawParams.memoType).toBeUndefined();
      }
    });

    it("parses URI with memo and memo_type", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&memo=123&memo_type=MEMO_ID"
      );
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.rawParams.memo).toBe("123");
        expect(result.rawParams.memoType).toBe("MEMO_ID");
        // routing should contain the memo-derived routingId
        expect(result.routing).toBeDefined();
      }
    });

    it("parses URI with URL-encoded memo text", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&memo=hello%20world&memo_type=MEMO_TEXT"
      );
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.rawParams.memo).toBe("hello world");
        expect(result.rawParams.memoType).toBe("MEMO_TEXT");
      }
    });

    it("parses URI with all optional parameters", () => {
      const uri =
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO" +
        "&amount=100.1234567" +
        "&asset_code=USDC" +
        "&asset_issuer=GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S" +
        "&memo=invoice%23123" +
        "&memo_type=MEMO_TEXT" +
        "&callback=url%3Ahttps%3A%2F%2Fexample.com%2Fcallback" +
        "&msg=Pay%20me%20with%20lumens" +
        "&origin_domain=example.com";

      const result = extractRoutingFromURI(uri);
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.rawParams.destination).toBe("GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO");
        expect(result.rawParams.amount).toBe("100.1234567");
        expect(result.rawParams.assetCode).toBe("USDC");
        expect(result.rawParams.assetIssuer).toBe("GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S");
        expect(result.rawParams.memo).toBe("invoice#123");
        expect(result.rawParams.memoType).toBe("MEMO_TEXT");
        expect(result.rawParams.callback).toBe("url:https://example.com/callback");
        expect(result.rawParams.msg).toBe("Pay me with lumens");
        expect(result.rawParams.originDomain).toBe("example.com");
      }
    });
  });

  describe("M-address handling", () => {
    it("passes M-address to extractRouting for canonical expansion", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLT7AV7Y6S33Z6S3CHBAAAAAAAAAAAAABQD"
      );
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        // extractRouting should expand M-address to G-address + routingId
        expect(result.routing.address).toMatch(/^G/);
        expect(result.routing.routingId).toBeDefined();
      }
    });
  });

  describe("edge cases", () => {
    it("handles URI with no query parameters", () => {
      const result = extractRoutingFromURI("web+stellar:pay");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("MISSING_DESTINATION");
      }
    });

    it("handles malformed URL encoding gracefully", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&memo=%ZZ"
      );
      // Should still succeed with raw memo value if decode fails
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.rawParams.memo).toBe("%ZZ"); // Raw fallback
      }
    });

    it("trims whitespace from destination", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=%20GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO%20"
      );
      expect(result.success).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.rawParams.destination).toBe("GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO");
      }
    });
  });

  describe("isSuccessfulURIResult type guard", () => {
    it("narrows successful results correctly", () => {
      const result = extractRoutingFromURI(
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO"
      );
      expect(isSuccessfulURIResult(result)).toBe(true);
      if (isSuccessfulURIResult(result)) {
        expect(result.routing).toBeDefined();
        expect(result.rawParams).toBeDefined();
      }
    });

    it("returns false for failed results", () => {
      const result = extractRoutingFromURI("invalid");
      expect(isSuccessfulURIResult(result)).toBe(false);
    });
  });
});
