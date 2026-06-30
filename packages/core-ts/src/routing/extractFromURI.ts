/**
 * SEP-0007 URI Parser
 *
 * Parses `web+stellar:pay?...` URIs (commonly from QR code scanners)
 * and delegates to the core `extractRouting` logic to produce canonical
 * routing information.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */

import { extractRouting } from "./extract";
import type { RoutingInput, RoutingResult } from "./types";

export interface SEP7PayParams {
  destination: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  memoType?: string;
  callback?: string;
  msg?: string;
  networkPassphrase?: string;
  originDomain?: string;
  signature?: string;
}

export type ExtractRoutingFromURIResult =
  | {
      success: true;
      routing: RoutingResult;
      rawParams: SEP7PayParams;
    }
  | {
      success: false;
      error: string;
      code: "INVALID_URI" | "UNSUPPORTED_OPERATION" | "MISSING_DESTINATION" | "INVALID_ENCODING";
    };

/**
 * Map SEP-0007 memo_type values to internal KnownMemoType.
 */
function mapMemoType(sep7MemoType: string | undefined): RoutingInput["memoType"] {
  if (!sep7MemoType) return "none";

  const upper = sep7MemoType.toUpperCase();
  switch (upper) {
    case "MEMO_ID":
      return "id";
    case "MEMO_TEXT":
      return "text";
    case "MEMO_HASH":
      return "hash";
    case "MEMO_RETURN":
      return "return";
    default:
      return "none";
  }
}

/**
 * Parse a SEP-0007 URI and extract canonical routing information.
 *
 * Supported format:
 *   web+stellar:pay?destination=<G...>&memo=<value>&memo_type=<MEMO_TEXT|MEMO_ID|MEMO_HASH|MEMO_RETURN>
 *
 * The function safely decodes URL-encoded parameters, validates the scheme,
 * and passes `destination` + `memo` into `extractRouting()` for canonical
 * output (handling G-addresses, M-addresses, C-addresses, etc.).
 *
 * @param uriString - The raw URI string from a QR code scanner or deeplink
 * @returns ExtractRoutingFromURIResult
 *
 * @example
 * ```ts
 * const result = extractRoutingFromURI(
 *   "web+stellar:pay?destination=GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI&memo=123&memo_type=MEMO_ID"
 * );
 * if (result.success) {
 *   console.log(result.routing.destinationBaseAccount); // "GAYC..."
 *   console.log(result.routing.routingId);            // "123"
 * }
 * ```
 */
export function extractRoutingFromURI(uriString: string): ExtractRoutingFromURIResult {
  // 1. Validate scheme
  if (!uriString.startsWith("web+stellar:")) {
    return {
      success: false,
      error: "URI must use 'web+stellar:' scheme",
      code: "INVALID_URI",
    };
  }

  // 2. Split operation and query string
  const withoutScheme = uriString.slice("web+stellar:".length);
  const [operation, queryString] = withoutScheme.includes("?")
    ? withoutScheme.split("?", 2)
    : [withoutScheme, ""];

  // 3. Only 'pay' operation is supported for routing extraction
  if (operation !== "pay") {
    return {
      success: false,
      error: `Unsupported operation: '${operation}'. Only 'pay' is supported for routing extraction.`,
      code: "UNSUPPORTED_OPERATION",
    };
  }

  // 4. Parse query parameters safely
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(queryString);
  } catch {
    return {
      success: false,
      error: "Failed to parse URI query parameters",
      code: "INVALID_ENCODING",
    };
  }

  // 5. Extract required destination
  const destination = params.get("destination");
  if (!destination || destination.trim() === "") {
    return {
      success: false,
      error: "Missing required 'destination' parameter",
      code: "MISSING_DESTINATION",
    };
  }

  // 6. Extract optional parameters with safe decoding
  const rawParams: SEP7PayParams = {
    destination: safelyDecode(destination.trim()),
    amount: safelyDecode(params.get("amount")),
    assetCode: safelyDecode(params.get("asset_code")),
    assetIssuer: safelyDecode(params.get("asset_issuer")),
    memo: safelyDecode(params.get("memo")),
    memoType: safelyDecode(params.get("memo_type")),
    callback: safelyDecode(params.get("callback")),
    msg: safelyDecode(params.get("msg")),
    networkPassphrase: safelyDecode(params.get("network_passphrase")),
    originDomain: safelyDecode(params.get("origin_domain")),
    signature: safelyDecode(params.get("signature")),
  };

  // 7. Build RoutingInput for extractRouting
  const routingInput: RoutingInput = {
    destination: rawParams.destination,
    memoType: mapMemoType(rawParams.memoType),
    memoValue: rawParams.memo ?? null,
    sourceAccount: null,
  };

  // 8. Delegate to core extractRouting logic
  const routingResult = extractRouting(routingInput);

  // 9. Return combined result
  return {
    success: true,
    routing: routingResult,
    rawParams,
  };
}

/**
 * Safely decode a URL-encoded value, returning undefined for null/empty.
 */
function safelyDecode(value: string | null): string | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // Return raw if decoding fails
  }
}

/**
 * Type guard for successful URI parsing.
 */
export function isSuccessfulURIResult(
  result: ExtractRoutingFromURIResult
): result is ExtractRoutingFromURIResult & { success: true } {
  return result.success === true;
}