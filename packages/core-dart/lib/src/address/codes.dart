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

  /// SEP-0029: the destination requires a memo but no routing ID was supplied.
  static const missingRequiredMemo = 'MISSING_REQUIRED_MEMO';

  /// Hidden/non-printable characters or surrounding whitespace were removed.
  static const sanitizedHiddenChars = 'SANITIZED_HIDDEN_CHARS';
}

/// Severity levels shared by every Stellar Address Kit implementation
/// (TypeScript, Go, Dart).
///
/// Use with [RoutingInput.minSeverityLevel] to drop lower-severity warnings.
abstract final class WarningSeverity {
  /// Informational; the input was adjusted or carries no risk.
  static const info = 'info';

  /// Potential integration issue worth logging.
  static const warn = 'warn';

  /// The payment cannot be credited safely as-is.
  static const error = 'error';

  /// Every level, from least to most severe.
  static const values = [info, warn, error];

  /// Ranks a severity: info (0) < warn (1) < error (2). Unrecognised values
  /// (including `null`) rank as info so a filter never silently drops them.
  static int rank(String? severity) {
    switch (severity) {
      case warn:
        return 1;
      case error:
        return 2;
      default:
        return 0;
    }
  }

  /// Whether [severity] is at or above [minSeverityLevel]. A `null` or
  /// unrecognised threshold admits everything.
  static bool meets(String? severity, String? minSeverityLevel) =>
      rank(severity) >= rank(minSeverityLevel);

  /// The canonical severity for a [WarningCode], or `null` for an unknown code.
  /// Mirrors `WARNING_SEVERITY` (core-ts) and `address.DefaultSeverity` (core-go).
  static String? forCode(String code) => _byCode[code];

  static const Map<String, String> _byCode = {
    WarningCode.sanitizedHiddenChars: info,
    WarningCode.contractSenderDetected: info,
    WarningCode.memoIgnoredForMuxed: info,
    WarningCode.nonCanonicalAddress: warn,
    WarningCode.nonCanonicalRoutingId: warn,
    WarningCode.memoPresentWithMuxed: warn,
    WarningCode.memoTextUnroutable: warn,
    WarningCode.memoIdInvalidFormat: warn,
    WarningCode.unsupportedMemoType: warn,
    WarningCode.invalidDestination: error,
    WarningCode.missingRequiredMemo: error,
  };
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

  const Normalization({required this.original, required this.normalized});

  Map<String, String> toJson() =>
      {'original': original, 'normalized': normalized};

  @override
  bool operator ==(Object other) =>
      other is Normalization &&
      other.original == original &&
      other.normalized == normalized;

  @override
  int get hashCode => Object.hash(original, normalized);

  @override
  String toString() => 'Normalization($original -> $normalized)';
}

/// Contextual details for specific warning types.
class WarningContext {
  /// The kind of destination address (G, M, or C).
  final String? destinationKind;

  /// The type of memo provided in the transaction.
  final String? memoType;

  const WarningContext({this.destinationKind, this.memoType});

  Map<String, String> toJson() => {
        if (destinationKind != null) 'destinationKind': destinationKind!,
        if (memoType != null) 'memoType': memoType!,
      };

  @override
  bool operator ==(Object other) =>
      other is WarningContext &&
      other.destinationKind == destinationKind &&
      other.memoType == memoType;

  @override
  int get hashCode => Object.hash(destinationKind, memoType);

  @override
  String toString() => 'WarningContext(${toJson()})';
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
