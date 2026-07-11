import '../address/codes.dart' as codes;
import '../address/parse.dart';
import '../muxed/decode.dart';
import 'routing_result.dart';
import 'memo.dart';

String _sanitizeAddress(String raw) {
  final cleaned = raw
      .replaceAll(RegExp(
        r'[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5'
        r'\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0'
        r'\r\n\t]',
      ), '')
      .trim();
  return cleaned;
}

/// Extracts deposit routing information from a Stellar payment input synchronously.
///
/// This is the synchronous variant for pure string parsing.
/// For future compatibility with async network checks (Federation, SEP-0029),
/// use [extractRouting] instead.
RoutingResult extractRoutingSync(RoutingInput input) {
  final original = input.destination;
  final sanitized = _sanitizeAddress(original);
  if (sanitized != original) {
    print('[stellar-address-kit] SANITIZED_HIDDEN_CHARS: Input contained hidden characters and was sanitized before processing.');
  }

  final trimmed = sanitized.trim();
  if (trimmed.isEmpty) {
    throw const ExtractRoutingException('Invalid input: destination must be a non-empty string.');
  }

  final prefix = trimmed[0].toUpperCase();
  if (prefix != 'G' && prefix != 'M') {
    throw ExtractRoutingException(
      'Invalid destination: expected a G or M address, got "$sanitized".',
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

  final parsed = parse(sanitized);

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

/// Extracts deposit routing information with support for future
/// async network checks (Federation, SEP-0029).
///
/// Currently delegates to [extractRoutingSync]; when async capabilities
/// are added this function will perform the additional checks.
Future<RoutingResult> extractRouting(RoutingInput input) async {
  return extractRoutingSync(input);
}

