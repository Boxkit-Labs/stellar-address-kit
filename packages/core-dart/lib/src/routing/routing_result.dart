/// Identifies the mechanism used to resolve a routing ID.
enum RoutingSource {
  /// The routing ID was extracted directly from a Muxed address (M-address).
  muxed,

  /// The routing ID was extracted from the transaction's MEMO field (ID or TEXT).
  memo,

  /// No routing ID could be resolved.
  none;

  /// Returns a human-friendly description of the routing source.
  String toDisplayString() {
    switch (this) {
      case RoutingSource.muxed:
        return 'Routed via muxed address (M-address)';
      case RoutingSource.memo:
        return 'Routed via memo ID';
      case RoutingSource.none:
        return 'No routing source detected';
    }
  }
}

/// Represents a non-blocking notification emitted during routing resolution.
class RoutingWarning {
  /// The unique code identifying the warning type.
  final String code;

  /// The severity of the warning (info, warn, error).
  final String severity;

  /// A descriptive message explaining the warning.
  final String message;

  const RoutingWarning({
    required this.code,
    required this.severity,
    required this.message,
  });

  /// Emitted when a memo is present but ignored because the destination is a muxed address.
  static const memoIgnored = RoutingWarning(
    code: 'memo-ignored',
    severity: 'info',
    message: 'Memo ignored for muxed address',
  );

  /// Emitted when the transaction sender is detected as a smart contract.
  static const contractSender = RoutingWarning(
    code: 'contract-sender',
    severity: 'info',
    message: 'Contract source detected. Routing state cleared.',
  );

  @override
  String toString() => '[$severity] $code: $message';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RoutingWarning &&
          runtimeType == other.runtimeType &&
          code == other.code &&
          severity == other.severity &&
          message == other.message;

  @override
  int get hashCode => Object.hash(code, severity, message);
}

/// Details of a terminal error encountered during destination account parsing.
class DestinationError {
  /// The [ErrorCode] identifying the failure reason.
  final String code;

  /// A human-readable error message.
  final String message;

  DestinationError({required this.code, required this.message});
}

/// Exception thrown when the routing input is fundamentally malformed.
class ExtractRoutingException implements Exception {
  final String message;
  const ExtractRoutingException(this.message);

  @override
  String toString() => 'ExtractRoutingException: $message';
}

/// The set of parameters required to resolve a deposit route.
class RoutingInput {
  /// The destination address (G, M, or C) from the payment operation.
  final String destination;

  /// The type of memo attached to the transaction (none, id, text, hash, return).
  final String memoType;

  /// The raw value of the memo field, if any.
  final String? memoValue;

  /// The source account address of the transaction.
  final String? sourceAccount;

  /// Minimum severity level for warnings to include in the result.
  /// Defaults to 'info' (all warnings returned). Valid values: 'info', 'warn', 'error'.
  final String? minSeverityLevel;

  RoutingInput({
    required this.destination,
    required this.memoType,
    this.memoValue,
    this.sourceAccount,
    this.minSeverityLevel,
  });
}

/// Immutable result object returned from routing resolution.
///
/// Holds the [source] tag indicating how the route was resolved,
/// an optional numeric [id] extracted from the address or memo,
/// and any [warnings] emitted during resolution.
final class RoutingResult {
  /// The mechanism that successfully resolved the routing ID.
  final RoutingSource source;

  /// The numeric routing identifier (e.g., User ID), or null if none was found.
  final BigInt? id;

  /// A list of non-blocking warnings encountered during resolution.
  final List<RoutingWarning> warnings;

  /// The classic 'G' address of the destination, even if an 'M' address was provided.
  final String? destinationBaseAccount;

  /// Details of the error if the destination address was unparseable.
  final DestinationError? destinationError;

  RoutingResult({
    required this.source,
    this.id,
    List<RoutingWarning>? warnings,
    this.destinationBaseAccount,
    this.destinationError,
  }) : warnings = List.unmodifiable(warnings ?? const []);

  String toDisplayString() {
    switch (source) {
      case RoutingSource.muxed:
        final idStr = id?.toString() ?? 'unknown';
        final base = destinationBaseAccount ?? 'unknown';
        return 'Muxed routing: ID $idStr -> $base';
      case RoutingSource.memo:
        final idStr = id?.toString() ?? 'unknown';
        return 'Memo routing: ID $idStr';
      case RoutingSource.none:
        return 'No routing detected';
    }
  }

  @override
  String toString() =>
      'RoutingResult(source: $source, id: $id, warnings: $warnings, destinationBaseAccount: $destinationBaseAccount, destinationError: $destinationError)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RoutingResult &&
          source == other.source &&
          id == other.id &&
          destinationBaseAccount == other.destinationBaseAccount &&
          destinationError?.code == other.destinationError?.code &&
          _listEquals(warnings, other.warnings);

  @override
  int get hashCode => Object.hash(source, id, destinationBaseAccount,
      destinationError?.code, Object.hashAll(warnings));

  static bool _listEquals(List<RoutingWarning> a, List<RoutingWarning> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
