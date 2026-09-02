import {
  AddressParseError,
  ExtractRoutingError,
  decodeMuxed,
  detect,
  extractRouting,
  normalizeMemoTextId,
  parse
} from "./chunk-JZUTXHBC.mjs";

// src/address/validate.ts
function validate(address, kind) {
  const detected = detect(address);
  if (detected === "invalid") return false;
  if (kind === void 0) return true;
  return detected === kind;
}

// src/muxed/encode.ts
import { StrKey } from "@stellar/stellar-sdk";
var MAX_UINT64 = 18446744073709551615n;
function encodeMuxed(baseG, id) {
  if (typeof id !== "bigint") {
    throw new TypeError(`ID must be a bigint, received ${typeof id}`);
  }
  if (id < 0n || id > MAX_UINT64) {
    throw new RangeError(`ID is outside the uint64 range: 0 to ${MAX_UINT64}`);
  }
  if (!StrKey.isValidEd25519PublicKey(baseG)) {
    throw new Error(`Invalid base G address (Ed25519 public key expected)`);
  }
  const pubkeyBytes = Buffer.from(StrKey.decodeEd25519PublicKey(baseG));
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64BE(id);
  return StrKey.encodeMed25519PublicKey(Buffer.concat([pubkeyBytes, idBytes]));
}

// src/routing/extractFromTx.ts
import StellarSdk from "@stellar/stellar-sdk";
var { Transaction } = StellarSdk;
function extractRoutingFromTx(tx) {
  const op = tx.operations[0];
  if (!op || op.type !== "payment") return null;
  return extractRouting({
    destination: op.destination,
    memoType: tx.memo.type,
    memoValue: tx.memo.value?.toString() ?? null,
    sourceAccount: tx.source ?? null
  });
}

// src/routing/extractFromURI.ts
function mapMemoType(sep7MemoType) {
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
function extractRoutingFromURI(uriString) {
  if (!uriString.startsWith("web+stellar:")) {
    return {
      success: false,
      error: "URI must use 'web+stellar:' scheme",
      code: "INVALID_URI"
    };
  }
  const withoutScheme = uriString.slice("web+stellar:".length);
  const [operation, queryString] = withoutScheme.includes("?") ? withoutScheme.split("?", 2) : [withoutScheme, ""];
  if (operation !== "pay") {
    return {
      success: false,
      error: `Unsupported operation: '${operation}'. Only 'pay' is supported for routing extraction.`,
      code: "UNSUPPORTED_OPERATION"
    };
  }
  let params;
  try {
    params = new URLSearchParams(queryString);
  } catch {
    return {
      success: false,
      error: "Failed to parse URI query parameters",
      code: "INVALID_ENCODING"
    };
  }
  const destination = params.get("destination");
  if (!destination || destination.trim() === "") {
    return {
      success: false,
      error: "Missing required 'destination' parameter",
      code: "MISSING_DESTINATION"
    };
  }
  const rawParams = {
    destination: safelyDecode(destination.trim()) ?? destination.trim(),
    amount: safelyDecode(params.get("amount")),
    assetCode: safelyDecode(params.get("asset_code")),
    assetIssuer: safelyDecode(params.get("asset_issuer")),
    memo: safelyDecode(params.get("memo")),
    memoType: safelyDecode(params.get("memo_type")),
    callback: safelyDecode(params.get("callback")),
    msg: safelyDecode(params.get("msg")),
    networkPassphrase: safelyDecode(params.get("network_passphrase")),
    originDomain: safelyDecode(params.get("origin_domain")),
    signature: safelyDecode(params.get("signature"))
  };
  const routingInput = {
    destination: rawParams.destination,
    memoType: mapMemoType(rawParams.memoType),
    memoValue: rawParams.memo ?? null,
    sourceAccount: null
  };
  const routingResult = extractRouting(routingInput);
  return {
    success: true,
    routing: routingResult,
    rawParams
  };
}
function safelyDecode(value) {
  if (value === null || value === "") {
    return void 0;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function isSuccessfulURIResult(result) {
  return result.success === true;
}

// src/routing/types.ts
function routingIdAsBigInt(routingId) {
  if (routingId === null) {
    return null;
  }
  return typeof routingId === "bigint" ? routingId : BigInt(routingId);
}
export {
  AddressParseError,
  ExtractRoutingError,
  decodeMuxed,
  detect,
  encodeMuxed,
  extractRouting,
  extractRoutingFromTx,
  extractRoutingFromURI,
  isSuccessfulURIResult,
  normalizeMemoTextId,
  parse,
  routingIdAsBigInt,
  validate
};
