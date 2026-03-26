enum AddressKind { g, m, c }

abstract final class ErrorCode {
  static const invalidChecksum = 'INVALID_CHECKSUM';
  static const invalidLength = 'INVALID_LENGTH';
  static const invalidBase32 = 'INVALID_BASE32';
  static const rejectedSeedKey = 'REJECTED_SEED_KEY';
  static const rejectedPreauth = 'REJECTED_PREAUTH';
  static const rejectedHashX = 'REJECTED_HASH_X';
  static const federationAddressNotSupported =
      'FEDERATION_ADDRESS_NOT_SUPPORTED';
  static const unknownPrefix = 'UNKNOWN_PREFIX';
}

abstract final class WarningCode {
  static const nonCanonicalAddress = 'NON_CANONICAL_ADDRESS';
  static const nonCanonicalRoutingId = 'NON_CANONICAL_ROUTING_ID';
  static const memoIgnoredForMuxed = 'MEMO_IGNORED_FOR_MUXED';
  static const memoPresentWithMuxed = 'MEMO_PRESENT_WITH_MUXED';
  static const contractSenderDetected = 'CONTRACT_SENDER_DETECTED';
  static const memoTextUnroutable = 'MEMO_TEXT_UNROUTABLE';
  static const memoIdInvalidFormat = 'MEMO_ID_INVALID_FORMAT';
  static const unsupportedMemoType = 'UNSUPPORTED_MEMO_TYPE';
  static const invalidDestination = 'INVALID_DESTINATION';
}

class Warning {
  final String code;
  final String message;
  final String severity;
  final Normalization? normalization;
  final WarningContext? context;

  Warning({
    required this.code,
    required this.message,
    required this.severity,
    this.normalization,
    this.context,
  });
}

class Normalization {
  final String original;
  final String normalized;

  Normalization({required this.original, required this.normalized});
}

class WarningContext {
  final String? destinationKind;
  final String? memoType;

  WarningContext({this.destinationKind, this.memoType});
}

class ParseResult {
  final AddressKind? kind;
  final String address;
  final List<Warning> warnings;
  final AddressError? error;

  ParseResult({
    this.kind,
    required this.address,
    required this.warnings,
    this.error,
  });
}

class AddressError {
  final String code;
  final String input;
  final String message;

  AddressError({
    required this.code,
    required this.input,
    required this.message,
  });
}
