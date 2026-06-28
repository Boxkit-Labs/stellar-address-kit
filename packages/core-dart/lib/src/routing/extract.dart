import '../address/codes.dart' as codes;
import '../address/parse.dart';
import '../muxed/decode.dart';
import 'routing_result.dart';
import 'memo.dart';

const _severityRank = {'info': 0, 'warn': 1, 'error': 2};

List<RoutingWarning> _filterBySeverity(List<RoutingWarning> warnings, String min) {
  final minRank = _severityRank[min] ?? 0;
  return warnings.where((w) => (_severityRank[w.severity] ?? 0) >= minRank).toList();
}

/// Extracts deposit routing information from a Stellar payment input.
/// Following the standard priority policy, M-address identifiers take
/// precedence over any provided memo.
RoutingResult extractRouting(RoutingInput input) {
  final result = _extractRouting(input);
  final min = input.minSeverityLevel ?? 'info';
  if (min == 'info') return result;
  return RoutingResult(
    source: result.source,
    id: result.id,
    warnings: _filterBySeverity(result.warnings.toList(), min),
    destinationBaseAccount: result.destinationBaseAccount,
    destinationError: result.destinationError,
  );
}

RoutingResult _extractRouting(RoutingInput input) {
  final trimmed = input.destination.trim();
  if (trimmed.isEmpty) {
    throw const ExtractRoutingException('Invalid input: destination must be a non-empty string.');
  }

  final prefix = trimmed[0].toUpperCase();
  if (prefix != 'G' && prefix != 'M') {
    throw ExtractRoutingException(
      'Invalid destination: expected a G or M address, got "${input.destination}".',
    );
  }

  if (input.sourceAccount != null && input.sourceAccount!.isNotEmpty) {
    try {
      final source = parse(input.sourceAccount!);
      if (source.kind == codes.AddressKind.c) {
        return RoutingResult(
          source: RoutingSource.none,
          warnings: [RoutingWarning.contractSender],
        );
      }
    } catch (_) {
      // Ignore source account parsing errors for routing extraction
    }
  }

  final parsed = parse(input.destination);

  if (parsed.kind == null) {
    return RoutingResult(
      source: RoutingSource.none,
      warnings: [],
      destinationError: parsed.error != null
          ? DestinationError(
              code: parsed.error!.code,
              message: parsed.error!.message,
            )
          : null,
    );
  }

  final warnings = <RoutingWarning>[];
  for (final w in parsed.warnings) {
    warnings.add(RoutingWarning(
      code: w.code,
      severity: w.severity,
      message: w.message,
    ));
  }

  if (parsed.kind == codes.AddressKind.m) {
    final decoded = MuxedDecoder.decodeMuxedString(parsed.address);
    final baseG = decoded.baseG;
    final muxedId = decoded.id;

    if (input.memoType == 'none') {
      return RoutingResult(
        destinationBaseAccount: baseG,
        id: muxedId,
        source: RoutingSource.muxed,
        warnings: warnings,
      );
    }

    BigInt? routingId;
    RoutingSource routingSource = RoutingSource.none;

    warnings.add(RoutingWarning.memoIgnored);

    if (input.memoType == 'id') {
      final norm = normalizeMemoId(input.memoValue ?? '');
      if (norm.normalized != null) {
        routingId = BigInt.parse(norm.normalized!);
        routingSource = RoutingSource.memo;
      } else {
        warnings.add(
          const RoutingWarning(
            code: codes.WarningCode.memoIdInvalidFormat,
            severity: 'warn',
            message: 'MEMO_ID was empty, non-numeric, or exceeded uint64 max.',
          ),
        );
      }
      for (final w in norm.warnings) {
        warnings.add(RoutingWarning(
          code: w.code,
          severity: w.severity,
          message: w.message,
        ));
      }
    } else if (input.memoType == 'text' && input.memoValue != null) {
      final norm = normalizeMemoTextId(input.memoValue!);
      if (norm.normalized != null) {
        routingId = BigInt.parse(norm.normalized!);
        routingSource = RoutingSource.memo;
      } else {
        warnings.add(
          const RoutingWarning(
            code: codes.WarningCode.memoTextUnroutable,
            severity: 'warn',
            message: 'MEMO_TEXT was not a valid numeric uint64.',
          ),
        );
      }
      for (final w in norm.warnings) {
        warnings.add(RoutingWarning(
          code: w.code,
          severity: w.severity,
          message: w.message,
        ));
      }
    } else if (input.memoType == 'hash' || input.memoType == 'return') {
      warnings.add(
        RoutingWarning(
          code: codes.WarningCode.unsupportedMemoType,
          severity: 'warn',
          message: 'Memo type ${input.memoType} is not supported for routing.',
        ),
      );
    } else {
      warnings.add(
        const RoutingWarning(
          code: codes.WarningCode.unsupportedMemoType,
          severity: 'warn',
          message: 'Unrecognized memo type: unknown',
        ),
      );
    }

    return RoutingResult(
      destinationBaseAccount: baseG,
      id: routingId,
      source: routingSource,
      warnings: warnings,
    );
  }

  BigInt? routingId;
  RoutingSource routingSource = RoutingSource.none;

  if (input.memoType == 'id') {
    final norm = normalizeMemoId(input.memoValue ?? '');
    if (norm.normalized != null) {
      routingId = BigInt.parse(norm.normalized!);
      routingSource = RoutingSource.memo;
    } else {
      warnings.add(
        const RoutingWarning(
          code: codes.WarningCode.memoIdInvalidFormat,
          severity: 'warn',
          message: 'MEMO_ID was empty, non-numeric, or exceeded uint64 max.',
        ),
      );
    }
    for (final w in norm.warnings) {
      warnings.add(RoutingWarning(
        code: w.code,
        severity: w.severity,
        message: w.message,
      ));
    }
  } else if (input.memoType == 'text' && input.memoValue != null) {
    final norm = normalizeMemoTextId(input.memoValue!);
    if (norm.normalized != null) {
      routingId = BigInt.parse(norm.normalized!);
      routingSource = RoutingSource.memo;
    } else {
      warnings.add(
        const RoutingWarning(
          code: codes.WarningCode.memoTextUnroutable,
          severity: 'warn',
          message: 'MEMO_TEXT was not a valid numeric uint64.',
        ),
      );
    }
    for (final w in norm.warnings) {
      warnings.add(RoutingWarning(
        code: w.code,
        severity: w.severity,
        message: w.message,
      ));
    }
  } else if (input.memoType == 'hash' || input.memoType == 'return') {
    warnings.add(
      RoutingWarning(
        code: codes.WarningCode.unsupportedMemoType,
        severity: 'warn',
        message: 'Memo type ${input.memoType} is not supported for routing.',
      ),
    );
  } else if (input.memoType != 'none') {
    warnings.add(
      const RoutingWarning(
        code: codes.WarningCode.unsupportedMemoType,
        severity: 'warn',
        message: 'Unrecognized memo type: unknown',
      ),
    );
  }

  return RoutingResult(
    destinationBaseAccount: parsed.address,
    id: routingId,
    source: routingSource,
    warnings: warnings,
  );
}

