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
type WarningCode = "NON_CANONICAL_ADDRESS" | "NON_CANONICAL_ROUTING_ID" | "MEMO_IGNORED_FOR_MUXED" | "MEMO_PRESENT_WITH_MUXED" | "CONTRACT_SENDER_DETECTED" | "MEMO_TEXT_UNROUTABLE" | "MEMO_ID_INVALID_FORMAT" | "UNSUPPORTED_MEMO_TYPE" | "INVALID_DESTINATION" | "MISSING_REQUIRED_MEMO";
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

type MemoRequirement = {
    requiringMemo: boolean;
};
type MemoRequirementFetcher = (baseAccount: string) => Promise<MemoRequirement | null>;
/**
 * Fetches SEP-0029 memo requirement configuration from a Horizon account.
 *
 * The helper is optional by design: callers provide a Horizon URL when they want
 * network-backed checks, and pass the result to `applyMemoRequirement`.
 */
declare function fetchMemoRequirement(baseAccount: string, horizonUrl?: string): Promise<MemoRequirement>;
declare function applyMemoRequirement(result: RoutingResult, requirement: MemoRequirement | null | undefined): RoutingResult;
declare function extractRoutingWithMemoRequirement(input: RoutingInput, fetcher?: MemoRequirementFetcher): Promise<RoutingResult>;

export { type Address, type AddressKind, AddressParseError, type ErrorCode, ExtractRoutingError, type KnownMemoType, type MemoRequirement, type MemoRequirementFetcher, type NormalizeResult, type ParseResult, type RoutingInput, type RoutingResult, type RoutingSource, type Warning, type WarningCode, applyMemoRequirement, decodeMuxed, detect, encodeMuxed, extractRouting, extractRoutingFromTx, extractRoutingWithMemoRequirement, fetchMemoRequirement, normalizeMemoTextId, parse, routingIdAsBigInt, validate };
