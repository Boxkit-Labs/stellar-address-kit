type ErrorCode = "INVALID_CHECKSUM" | "INVALID_LENGTH" | "INVALID_BASE32" | "REJECTED_SEED_KEY" | "REJECTED_PREAUTH" | "REJECTED_HASH_X" | "FEDERATION_ADDRESS_NOT_SUPPORTED" | "UNKNOWN_PREFIX";
/**
 * Represents an error encountered during the parsing of a Stellar address.
 * Includes a machine-readable ErrorCode and the original input string.
 */
declare class AddressParseError extends Error {
    code: ErrorCode;
    readonly input: string;
    constructor(code: ErrorCode, input: string, message: string);
}

/**
 * Identifies the Stellar address kind from a string input.
 * Supports G (Ed25519), M (Muxed/SEP-23), and C (Contract) addresses.
 * Returns "invalid" if the input does not match a supported format.
 */
declare function detect(address: string): "G" | "M" | "C" | "invalid";

type AddressKind = "G" | "M" | "C";
/**
 * Severity levels for validation warnings.
 * Used with `minSeverityLevel` to filter warnings by importance.
 */
type WarningSeverity = "info" | "warn" | "error";
type WarningCode = "NON_CANONICAL_ADDRESS" | "NON_CANONICAL_ROUTING_ID" | "MEMO_IGNORED_FOR_MUXED" | "MEMO_PRESENT_WITH_MUXED" | "CONTRACT_SENDER_DETECTED" | "MEMO_TEXT_UNROUTABLE" | "MEMO_ID_INVALID_FORMAT" | "UNSUPPORTED_MEMO_TYPE" | "INVALID_DESTINATION" | "SANITIZED_HIDDEN_CHARS";
type Warning = {
    code: "NON_CANONICAL_ADDRESS" | "NON_CANONICAL_ROUTING_ID";
    severity: "warn";
    message: string;
    normalization: {
        original: string;
        normalized: string;
    };
} | {
    code: "INVALID_DESTINATION";
    severity: "error";
    message: string;
    context: {
        destinationKind: "C";
    };
} | {
    code: "UNSUPPORTED_MEMO_TYPE";
    severity: "warn";
    message: string;
    context: {
        memoType: "hash" | "return" | "unknown";
    };
} | {
    code: Exclude<WarningCode, "NON_CANONICAL_ADDRESS" | "NON_CANONICAL_ROUTING_ID" | "INVALID_DESTINATION" | "UNSUPPORTED_MEMO_TYPE">;
    severity: "info" | "warn" | "error";
    message: string;
};
type Address = {
    kind: "G";
    address: string;
    warnings: Warning[];
} | {
    kind: "M";
    address: string;
    baseG: string;
    muxedId: bigint;
    warnings: Warning[];
} | {
    kind: "C";
    address: string;
    warnings: Warning[];
};
type ParseResult = Address | {
    kind: "invalid";
    error: {
        code: ErrorCode;
        input: string;
        message: string;
    };
};

/**
  * This function first detects the address type using {@link detect}.
  * - If the address is invalid, it returns `false`.
  * - If no `kind` is provided, any valid address returns `true`.
  * - If `kind` is provided, the address must match that type.
  *
  * @param address - The address string to validate.
  * @param AddressKindind - Optional expected address type: `"G"`, `"M"`, or `"C"`.
  * @returns `true` if the address is valid (and matches `kind` if provided), otherwise `false`.
  *
  * @example
  * validate("GBRPYHIL2C...");        // true
  * validate("MA3D5F...", "M");       // true
  * validate("CA7Q...", "G");         // false
  * validate("invalid");              // false
 */
declare function validate(address: string, kind?: AddressKind): boolean;

/**
 * Parses a Stellar address string and returns a structured result.
 * Supports G (Public Key), C (Contract), and M (Muxed) addresses.
 *
 * @param address - The Stellar address string to parse.
 * @returns A {@link ParseResult} containing the parsed address components.
 * @throws {AddressParseError} If the address prefix is unknown or checksum/length validation fails.
 */
declare function parse(address: string): ParseResult;

/**
 * Encodes a base G address and numeric ID into a muxed Stellar address (SEP-23).
 * Uses BigInt for the ID to prevent precision loss and ensures the ID is within uint64 boundaries.
 *
 * @param baseG - Ed25519 public key string starting with 'G'.
 * @param id - The 64-bit routing ID as a BigInt.
 * @returns The encoded muxed address string starting with 'M'.
 * @throws {TypeError} If ID is not a BigInt.
 * @throws {RangeError} If ID is outside the uint64 range [0, 2^64-1].
 */
declare function encodeMuxed(baseG: string, id: bigint): string;

/**
 * Decodes a muxed Stellar address (SEP-23) into its base account and ID.
 * Uses the official Stellar SDK MuxedAccount parser to ensure specification compliance.
 *
 * @param mAddress - The muxed address string starting with 'M'.
 * @returns Metadata containing the base G address and the 64-bit BigInt ID.
 * @throws {Error} If the address is not a valid muxed address.
 */
declare function decodeMuxed(mAddress: string): {
    baseG: string;
    id: bigint;
};

type RoutingSource = "muxed" | "memo" | "none";
type RoutingInput = {
    destination: string;
    memoType: string;
    memoValue: string | null;
    sourceAccount: string | null;
    /**
     * Minimum severity level for warnings to include in the result.
     * Warnings below this threshold are filtered out.
     * Defaults to `'info'` (all warnings are returned).
     */
    minSeverityLevel?: WarningSeverity;
};
type KnownMemoType = "none" | "id" | "text" | "hash" | "return";
type RoutingResult = {
    destinationBaseAccount: string | null;
    routingId: string | bigint | null;
    routingSource: RoutingSource;
    warnings: Warning[];
    destinationError?: {
        code: ErrorCode;
        message: string;
    };
};
declare function routingIdAsBigInt(routingId: string | bigint | null): bigint | null;

declare class ExtractRoutingError extends Error {
    constructor(message: string);
}
/**
 * Extracts deposit routing information from a Stellar address and memo.
 *
 * Routing Policy:
 * 1. M-addresses: Routing ID is extracted from the address; any memo is ignored for routing.
 * 2. G-addresses: Routing ID is extracted from MEMO_ID or numeric MEMO_TEXT if valid.
 *
 * @param input - The destination address and optional memo components.
 * @returns A result containing the base account, routing ID, source, and any warnings.
 */
declare function extractRouting(input: RoutingInput): RoutingResult;

/**
 * Extracts routing information from a Stellar transaction.
 *
 * @param {Transaction} tx - The transaction to extract routing info from.
 * @returns {RoutingResult | null} The routing result or null if the transaction is not a simple payment.
 */
declare function extractRoutingFromTx(tx: any): RoutingResult | null;

/**
 * SEP-0007 URI Parser
 *
 * Parses `web+stellar:pay?...` URIs (commonly from QR code scanners)
 * and delegates to the core `extractRouting` logic to produce canonical
 * routing information.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */

interface SEP7PayParams {
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
type ExtractRoutingFromURIResult = {
    success: true;
    routing: RoutingResult;
    rawParams: SEP7PayParams;
} | {
    success: false;
    error: string;
    code: "INVALID_URI" | "UNSUPPORTED_OPERATION" | "MISSING_DESTINATION" | "INVALID_ENCODING";
};
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
declare function extractRoutingFromURI(uriString: string): ExtractRoutingFromURIResult;
/**
 * Type guard for successful URI parsing.
 */
declare function isSuccessfulURIResult(result: ExtractRoutingFromURIResult): result is ExtractRoutingFromURIResult & {
    success: true;
};

type NormalizeResult = {
    normalized: string | null;
    warnings: Warning[];
};
/**
 * Normalizes a numeric string into a canonical uint64 representation.
 * Strips leading zeros and validates that the value is within uint64 boundaries.
 *
 * @param s - The numeric string to normalize.
 * @returns Result containing the normalized string (or null if invalid) and any warnings.
 */
declare function normalizeMemoTextId(s: string): NormalizeResult;

export { type Address, type AddressKind, AddressParseError, type ErrorCode, ExtractRoutingError, type ExtractRoutingFromURIResult, type KnownMemoType, type NormalizeResult, type ParseResult, type RoutingInput, type RoutingResult, type RoutingSource, type SEP7PayParams, type Warning, type WarningCode, type WarningSeverity, decodeMuxed, detect, encodeMuxed, extractRouting, extractRoutingFromTx, extractRoutingFromURI, isSuccessfulURIResult, normalizeMemoTextId, parse, routingIdAsBigInt, validate };
