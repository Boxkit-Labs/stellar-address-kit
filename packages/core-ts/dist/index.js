"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AddressParseError: () => AddressParseError,
  ExtractRoutingError: () => ExtractRoutingError,
  decodeMuxed: () => decodeMuxed,
  detect: () => detect,
  encodeMuxed: () => encodeMuxed,
  extractRouting: () => extractRouting,
  extractRoutingFromTx: () => extractRoutingFromTx,
  extractRoutingFromURI: () => extractRoutingFromURI,
  isSuccessfulURIResult: () => isSuccessfulURIResult,
  normalizeMemoTextId: () => normalizeMemoTextId,
  parse: () => parse,
  routingIdAsBigInt: () => routingIdAsBigInt,
  validate: () => validate
});
module.exports = __toCommonJS(index_exports);

// src/address/errors.ts
var AddressParseError = class _AddressParseError extends Error {
  code;
  input;
  constructor(code, input, message) {
    super(message);
    this.name = "AddressParseError";
    this.code = code;
    this.input = input;
    Object.setPrototypeOf(this, _AddressParseError.prototype);
  }
};

// src/address/detect.ts
var import_stellar_sdk = __toESM(require("@stellar/stellar-sdk"));
var { StrKey } = import_stellar_sdk.default;
var BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decodeBase32(input) {
  const s = input.toUpperCase().replace(/=+$/, "");
  const byteCount = Math.floor(s.length * 5 / 8);
  const result = new Uint8Array(byteCount);
  let buffer = 0;
  let bitsLeft = 0;
  let byteIndex = 0;
  for (const ch of s) {
    const value = BASE32_CHARS.indexOf(ch);
    if (value === -1) throw new Error(`Invalid base32 character: ${ch}`);
    buffer = buffer << 5 | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      if (byteIndex < byteCount) {
        result[byteIndex++] = buffer >> bitsLeft - 8 & 255;
      }
      bitsLeft -= 8;
      buffer &= (1 << bitsLeft) - 1;
    }
  }
  return result;
}
function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 32768) {
        crc = crc << 1 ^ 4129;
      } else {
        crc <<= 1;
      }
      crc &= 65535;
    }
  }
  return crc;
}
function detect(address) {
  if (!address) return "invalid";
  const up = address.toUpperCase();
  if (StrKey.isValidEd25519PublicKey(up)) return "G";
  if (StrKey.isValidMed25519PublicKey(up)) return "M";
  if (StrKey.isValidContract(up)) return "C";
  try {
    const prefix = up[0];
    if (prefix === "M") {
      const decoded = decodeBase32(up);
      if (decoded.length === 43 && decoded[0] === 96) {
        const data = decoded.slice(0, decoded.length - 2);
        const checksum = decoded[decoded.length - 2] | decoded[decoded.length - 1] << 8;
        if (crc16(data) === checksum) {
          return "M";
        }
      }
    }
  } catch {
  }
  return "invalid";
}

// src/address/validate.ts
function validate(address, kind) {
  const detected = detect(address);
  if (detected === "invalid") return false;
  if (kind === void 0) return true;
  return detected === kind;
}

// src/muxed/decode.ts
var import_stellar_sdk2 = require("@stellar/stellar-sdk");
function decodeMuxed(mAddress) {
  const muxed = import_stellar_sdk2.MuxedAccount.fromAddress(mAddress, "0");
  return {
    baseG: muxed.baseAccount().accountId(),
    id: BigInt(muxed.id())
  };
}

// src/address/parse.ts
function parse(address) {
  const up = address.toUpperCase();
  const kind = detect(up);
  if (kind === "invalid") {
    const first = up[0];
    if (first === "G" || first === "M" || first === "C") {
      throw new AddressParseError(
        "INVALID_CHECKSUM",
        address,
        "Invalid address checksum"
      );
    }
    throw new AddressParseError("UNKNOWN_PREFIX", address, "Invalid address");
  }
  switch (kind) {
    case "G":
      return { kind: "G", address: up, warnings: [] };
    case "C":
      return { kind: "C", address: up, warnings: [] };
    case "M": {
      try {
        const decoded = decodeMuxed(up);
        return {
          kind: "M",
          address: up,
          baseG: decoded.baseG,
          muxedId: decoded.id,
          warnings: []
        };
      } catch (error) {
        if (error instanceof AddressParseError) {
          throw error;
        }
        throw new AddressParseError(
          "INVALID_CHECKSUM",
          address,
          "Invalid muxed address"
        );
      }
    }
  }
}

// src/muxed/encode.ts
var import_stellar_sdk3 = require("@stellar/stellar-sdk");
var MAX_UINT64 = 18446744073709551615n;
function encodeMuxed(baseG, id) {
  if (typeof id !== "bigint") {
    throw new TypeError(`ID must be a bigint, received ${typeof id}`);
  }
  if (id < 0n || id > MAX_UINT64) {
    throw new RangeError(`ID is outside the uint64 range: 0 to ${MAX_UINT64}`);
  }
  if (!import_stellar_sdk3.StrKey.isValidEd25519PublicKey(baseG)) {
    throw new Error(`Invalid base G address (Ed25519 public key expected)`);
  }
  const pubkeyBytes = Buffer.from(import_stellar_sdk3.StrKey.decodeEd25519PublicKey(baseG));
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64BE(id);
  return import_stellar_sdk3.StrKey.encodeMed25519PublicKey(Buffer.concat([pubkeyBytes, idBytes]));
}

// src/routing/memo.ts
var UINT64_MAX = BigInt("18446744073709551615");
function normalizeMemoTextId(s) {
  const warnings = [];
  if (s.length === 0 || !/^\d+$/.test(s)) {
    return { normalized: null, warnings };
  }
  let normalized = s.replace(/^0+/, "");
  if (normalized === "") {
    normalized = "0";
  }
  if (normalized !== s) {
    warnings.push({
      code: "NON_CANONICAL_ROUTING_ID",
      severity: "warn",
      message: "Memo routing ID had leading zeros. Normalized to canonical decimal.",
      normalization: { original: s, normalized }
    });
  }
  try {
    const val = BigInt(normalized);
    if (val > UINT64_MAX) {
      return { normalized: null, warnings };
    }
  } catch {
    return { normalized: null, warnings };
  }
  return { normalized, warnings };
}

// src/routing/extract.ts
var SEVERITY_ORDER = {
  info: 0,
  warn: 1,
  error: 2
};
function filterBySeverity(warnings, minSeverity) {
  const threshold = SEVERITY_ORDER[minSeverity];
  return warnings.filter((w) => SEVERITY_ORDER[w.severity] >= threshold);
}
var ExtractRoutingError = class _ExtractRoutingError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractRoutingError";
    Object.setPrototypeOf(this, _ExtractRoutingError.prototype);
  }
};
function sanitizeDestination(destination) {
  if (!destination || typeof destination !== "string") {
    return { sanitized: destination, wasSanitized: false };
  }
  const sanitized = destination.replace(/[\p{C}\s]/gu, "");
  return {
    sanitized,
    wasSanitized: sanitized !== destination
  };
}
function assertRoutableAddress(destination) {
  if (!destination || typeof destination !== "string") {
    throw new ExtractRoutingError(
      "Invalid input: destination must be a non-empty string."
    );
  }
  const prefix = destination.trim()[0]?.toUpperCase();
  if (prefix !== "G" && prefix !== "M") {
    throw new ExtractRoutingError(
      `Invalid destination: expected a G or M address, got "${destination}".`
    );
  }
}
function extractRouting(input) {
  const { sanitized: destination, wasSanitized } = sanitizeDestination(
    input.destination
  );
  assertRoutableAddress(destination);
  const minSeverity = input.minSeverityLevel ?? "info";
  const sanitizedWarning = wasSanitized ? {
    code: "SANITIZED_HIDDEN_CHARS",
    severity: "info",
    message: "Destination address contained non-printable characters or whitespace that were stripped."
  } : null;
  const initWarnings = (additional = []) => {
    return sanitizedWarning ? [sanitizedWarning, ...additional] : [...additional];
  };
  let parsed;
  try {
    parsed = parse(destination);
  } catch (error) {
    if (error instanceof AddressParseError) {
      return {
        destinationBaseAccount: null,
        routingId: null,
        routingSource: "none",
        warnings: filterBySeverity(initWarnings(), minSeverity),
        destinationError: {
          code: error.code,
          message: error.message
        }
      };
    }
    throw error;
  }
  if (parsed.kind === "invalid") {
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: filterBySeverity(initWarnings(), minSeverity)
    };
  }
  if (parsed.kind === "C") {
    const warnings2 = initWarnings(parsed.warnings);
    warnings2.push({
      code: "INVALID_DESTINATION",
      severity: "error",
      message: "C address is not a valid destination",
      context: {
        destinationKind: "C"
      }
    });
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: filterBySeverity(warnings2, minSeverity)
    };
  }
  if (parsed.kind === "M") {
    const warnings2 = initWarnings(parsed.warnings);
    if (input.memoType === "id" || input.memoType === "text" && /^\d+$/.test(input.memoValue ?? "")) {
      warnings2.push({
        code: "MEMO_PRESENT_WITH_MUXED",
        severity: "warn",
        message: "Routing ID found in both M-address and Memo. M-address ID takes precedence."
      });
    } else if (input.memoType !== "none") {
      warnings2.push({
        code: "MEMO_IGNORED_FOR_MUXED",
        severity: "info",
        message: "Memo present with M-address. Any potential routing ID in memo is ignored."
      });
    }
    return {
      destinationBaseAccount: parsed.baseG,
      routingId: parsed.muxedId,
      routingSource: "muxed",
      warnings: filterBySeverity(warnings2, minSeverity)
    };
  }
  let routingId = null;
  let routingSource = "none";
  const warnings = initWarnings(parsed.warnings);
  if (input.memoType === "id") {
    const rawValue = input.memoValue ?? "";
    const norm = normalizeMemoTextId(rawValue);
    if (norm.normalized) {
      const parsedMemoId = BigInt(norm.normalized);
      routingId = parsedMemoId.toString();
      routingSource = "memo";
      warnings.push(...norm.warnings);
    } else {
      routingSource = "none";
      warnings.push(...norm.warnings);
      warnings.push({
        code: "MEMO_ID_INVALID_FORMAT",
        severity: "warn",
        message: "MEMO_ID was empty, non-numeric, or exceeded uint64 max."
      });
    }
  } else if (input.memoType === "text" && input.memoValue) {
    const norm = normalizeMemoTextId(input.memoValue);
    if (norm.normalized) {
      routingId = norm.normalized;
      routingSource = "memo";
      warnings.push(...norm.warnings);
    } else {
      warnings.push({
        code: "MEMO_TEXT_UNROUTABLE",
        severity: "warn",
        message: "MEMO_TEXT was not a valid numeric uint64."
      });
    }
  } else if (input.memoType === "hash" || input.memoType === "return") {
    warnings.push({
      code: "MEMO_TEXT_UNROUTABLE",
      severity: "warn",
      message: `Memo type ${input.memoType} is not supported for routing.`
    });
  } else if (input.memoType !== "none") {
    warnings.push({
      code: "MEMO_TEXT_UNROUTABLE",
      severity: "warn",
      message: `Unrecognized memo type: ${input.memoType}`
    });
  }
  return {
    destinationBaseAccount: parsed.address,
    routingId,
    routingSource,
    warnings: filterBySeverity(warnings, minSeverity)
  };
}

// src/routing/extractFromTx.ts
var import_stellar_sdk4 = __toESM(require("@stellar/stellar-sdk"));
var { Transaction } = import_stellar_sdk4.default;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
});
