/// The three types of Stellar addresses supported by the kit.
enum AddressKind {
  /// Classic 56-character Stellar account address starting with 'G'.
  g,

  /// Muxed account address starting with 'M', encoding a 'G' address and a 64-bit ID.
  m,

  /// Soroban smart-contract address starting with 'C'.
  c
}

/// Standard error codes returned when address parsing fails.
abstract final class ErrorCode {
  /// The CRC-16 checksum of the address is invalid.
  static const invalidChecksum = 'INVALID_CHECKSUM';

  /// The decoded length of the address does not match its prefix requirements.
  static const invalidLength = 'INVALID_LENGTH';

  /// The input string is not a valid Base32 encoded sequence.
  static const invalidBase32 = 'INVALID_BASE32';

  /// Seed keys (starting with 'S') are not accepted as payment destinations.
  static const rejectedSeedKey = 'REJECTED_SEED_KEY';

  /// Pre-authorized transaction hashes (starting with 'T') are not accepted.
  static const rejectedPreauth = 'REJECTED_PREAUTH';

  /// HashX identifiers (starting with 'X') are not accepted.
  static const rejectedHashX = 'REJECTED_HASH_X';

  /// Federation addresses (name*domain.com) are not supported by this kit.
  static const federationAddressNotSupported =
      'FEDERATION_ADDRESS_NOT_SUPPORTED';

  /// The address prefix is not one of 'G', 'M', or 'C'.
  static const unknownPrefix = 'UNKNOWN_PREFIX';
}

/// Warning codes returned when an address is valid but has non-standard properties.
abstract final class WarningCode {
  /// The address has non-canonical casing (usually lowercase).
  static const nonCanonicalAddress = 'NON_CANONICAL_ADDRESS';

  /// The routing ID has non-canonical formatting (e.g., leading zeros).
  static const nonCanonicalRoutingId = 'NON_CANONICAL_ROUTING_ID';

  /// A memo was provided but ignored because the M-address already contains an ID.
  static const memoIgnoredForMuxed = 'MEMO_IGNORED_FOR_MUXED';

  /// Both an M-address and a routing memo were present in the transaction.
  static const memoPresentWithMuxed = 'MEMO_PRESENT_WITH_MUXED';

  /// The transaction sender is a smart contract.
  static const contractSenderDetected = 'CONTRACT_SENDER_DETECTED';

  /// The MEMO_TEXT field is not a valid numeric uint64.
  static const memoTextUnroutable = 'MEMO_TEXT_UNROUTABLE';

  /// The MEMO_ID field is malformed or exceeds uint64 range.
  static const memoIdInvalidFormat = 'MEMO_ID_INVALID_FORMAT';

  /// The provided memo type (e.g., HASH or RETURN) is not supported for routing.
  static const unsupportedMemoType = 'UNSUPPORTED_MEMO_TYPE';

  /// The destination is a smart contract, which is invalid for classic payments.
  static const invalidDestination = 'INVALID_DESTINATION';

  /// Hidden control characters or whitespace were stripped from the destination address.
  static const sanitizedHiddenChars = 'SANITIZED_HIDDEN_CHARS';
}

/// Represents a warning encountered during address parsing or routing.
class Warning {
  /// The [WarningCode] identifying the type of warning.
  final String code;

  /// A human-readable description of the warning.
  final String message;

  /// The severity of the warning (info, warn, error).
  final String severity;

  /// Optional normalization payload if the input was non-canonical.
  final Normalization? normalization;

  /// Optional context providing additional details about the warning.
  final WarningContext? context;

  Warning({
    required this.code,
    required this.message,
    required this.severity,
    this.normalization,
    this.context,
  });
}

/// Details about a non-canonical input that was normalized.
class Normalization {
  /// The original raw input string.
  final String original;

  /// The normalized canonical representation.
  final String normalized;

  Normalization({required this.original, required this.normalized});
}

/// Contextual details for specific warning types.
class WarningContext {
  /// The kind of destination address (G, M, or C).
  final String? destinationKind;

  /// The type of memo provided in the transaction.
  final String? memoType;

  WarningContext({this.destinationKind, this.memoType});
}

/// The result of parsing a raw Stellar address string.
class ParseResult {
  /// The detected [AddressKind], or null if parsing failed.
  final AddressKind? kind;

  /// The canonical address string (always uppercase).
  final String address;

  /// A list of non-blocking [Warning]s encountered during parsing.
  final List<Warning> warnings;

  /// Details of the error if [kind] is null.
  final AddressError? error;

  ParseResult({
    this.kind,
    required this.address,
    required this.warnings,
    this.error,
  });
}

/// Details of a terminal error encountered during address parsing.
class AddressError {
  /// The [ErrorCode] identifying the failure reason.
  final String code;

  /// The original input string that failed parsing.
  final String input;

  /// A human-readable error message.
  final String message;

  AddressError({
    required this.code,
    required this.input,
    required this.message,
  });
}
