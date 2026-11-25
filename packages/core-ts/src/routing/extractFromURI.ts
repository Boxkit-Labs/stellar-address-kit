import { extractRouting } from "./extract";
import type { RoutingResult } from "./types";

export type URIErrorCode =
  | "INVALID_URI"
  | "UNSUPPORTED_OPERATION"
  | "MISSING_DESTINATION"
  | "INVALID_ENCODING";

export type URIRoutingResult = {
  /** Canonical routing result; null when the URI could not be processed. */
  result: RoutingResult | null;
  uriError?: { code: URIErrorCode; message: string };
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
};

const SCHEME = "web+stellar:";

const MEMO_TYPE_MAP: Record<string, string> = {
  MEMO_TEXT: "text",
  MEMO_ID: "id",
  MEMO_HASH: "hash",
  MEMO_RETURN: "return",
};

function fail(code: URIErrorCode, message: string): URIRoutingResult {
  return { result: null, uriError: { code, message } };
}

function base64ToHex(value: string): string | null {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(b64) || b64.length % 4 === 1) return null;
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Buffer.from(padded, "base64");
  if (bytes.length !== 32) return null;
  return bytes.toString("hex");
}

/**
 * Parses a SEP-0007 `web+stellar:pay` URI and routes it through
 * `extractRouting`. Never throws; malformed input yields `uriError`.
 */
export function extractRoutingFromURI(
  uri: string,
  config?: { allowHashRouting?: boolean }
): URIRoutingResult {
  try {
    if (typeof uri !== "string" || uri.trim() === "") {
      return fail("INVALID_URI", "URI must be a non-empty string.");
    }
    const trimmed = uri.trim();
    if (trimmed.slice(0, SCHEME.length).toLowerCase() !== SCHEME) {
      return fail("INVALID_URI", `URI must start with ${SCHEME}`);
    }

    const rest = trimmed.slice(SCHEME.length).split("#")[0];
    const qIndex = rest.indexOf("?");
    const operation = (qIndex === -1 ? rest : rest.slice(0, qIndex)).toLowerCase();
    const query = qIndex === -1 ? "" : rest.slice(qIndex + 1);

    if (operation === "tx") {
      return fail("UNSUPPORTED_OPERATION", "Operation 'tx' is not supported.");
    }
    if (operation !== "pay") {
      return fail("INVALID_URI", `Unknown SEP-0007 operation '${operation}'.`);
    }

    const params = new Map<string, string>();
    for (const pair of query.split("&")) {
      if (pair === "") continue;
      const eq = pair.indexOf("=");
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawVal = eq === -1 ? "" : pair.slice(eq + 1);
      let key: string;
      let val: string;
      try {
        key = decodeURIComponent(rawKey);
        val = decodeURIComponent(rawVal);
      } catch {
        return fail("INVALID_ENCODING", "Query contains invalid percent-encoding.");
      }
      if (!params.has(key)) params.set(key, val);
    }

    const destination = params.get("destination");
    if (!destination || destination.trim() === "") {
      return fail("MISSING_DESTINATION", "Missing 'destination' parameter.");
    }

    const memo = params.get("memo");
    let memoType = "none";
    let memoValue: string | null = null;
    if (memo !== undefined && memo !== "") {
      const sepType = (params.get("memo_type") ?? "MEMO_TEXT").toUpperCase();
      const mapped = MEMO_TYPE_MAP[sepType];
      if (!mapped) {
        return fail("INVALID_URI", `Unsupported memo_type '${sepType}'.`);
      }
      memoType = mapped;
      memoValue = memo;
      if (mapped === "hash" || mapped === "return") {
        const hex = base64ToHex(memo);
        if (hex === null) {
          return fail(
            "INVALID_ENCODING",
            `memo for ${sepType} must be base64-encoded 32 bytes.`
          );
        }
        memoValue = hex;
      }
    }

    let result: RoutingResult;
    try {
      result = extractRouting(
        { destination, memoType, memoValue, sourceAccount: null },
        config
      );
    } catch (e) {
      return fail(
        "INVALID_URI",
        e instanceof Error ? e.message : "Invalid destination."
      );
    }

    const out: URIRoutingResult = { result };
    const amount = params.get("amount");
    const code = params.get("asset_code");
    const issuer = params.get("asset_issuer");
    if (amount) out.amount = amount;
    if (code) out.assetCode = code;
    if (issuer) out.assetIssuer = issuer;
    return out;
  } catch (e) {
    return fail("INVALID_URI", e instanceof Error ? e.message : "Invalid URI.");
  }
}
