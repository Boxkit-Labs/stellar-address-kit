import '../address/codes.dart' as codes;
import '../address/parse.dart';
import '../muxed/decode.dart';
import 'routing_result.dart';
import 'memo.dart';
import 'safe_routing_id.dart';

final class _SanitizedDestination {
  final String value;
  final bool modified;

  const _SanitizedDestination(this.value, this.modified);
}

/// Removes Unicode control/format/private-use/noncharacter code points and
/// default-ignorable characters (zero-width spaces, bidi controls, variation
/// selectors, byte-order marks, and similar), then trims surrounding Unicode
/// whitespace. Printable characters inside the address are deliberately kept
/// so malformed StrKeys still fail validation.
_SanitizedDestination _sanitizeDestination(String destination) {
  final buffer = StringBuffer();
  for (final rune in destination.runes) {
    if (!_isHiddenOrNonPrintable(rune)) {
      buffer.writeCharCode(rune);
    }
  }

  final sanitized = buffer.toString().trim();
  return _SanitizedDestination(sanitized, sanitized != destination);
}

bool _isHiddenOrNonPrintable(int rune) {
  // C0/C1 controls, including NUL, tabs, CR, and LF.
  if (rune <= 0x001F || (rune >= 0x007F && rune <= 0x009F)) return true;

  // Unicode format controls and default-ignorable code points.
  if (rune == 0x00AD ||
      rune == 0x034F ||
      (rune >= 0x0600 && rune <= 0x0605) ||
      rune == 0x061C ||
      rune == 0x06DD ||
      rune == 0x070F ||
      (rune >= 0x0890 && rune <= 0x0891) ||
      rune == 0x08E2 ||
      (rune >= 0x115F && rune <= 0x1160) ||
      (rune >= 0x17B4 && rune <= 0x17B5) ||
      (rune >= 0x180B && rune <= 0x180F) ||
      (rune >= 0x200B && rune <= 0x200F) ||
      (rune >= 0x2028 && rune <= 0x202E) ||
      (rune >= 0x2060 && rune <= 0x206F) ||
      rune == 0x3164 ||
      (rune >= 0xFE00 && rune <= 0xFE0F) ||
      rune == 0xFEFF ||
      rune == 0xFFA0 ||
      (rune >= 0xFFF0 && rune <= 0xFFFB) ||
      rune == 0x110BD ||
      rune == 0x110CD ||
      (rune >= 0x13430 && rune <= 0x1345F) ||
      (rune >= 0x1BCA0 && rune <= 0x1BCA3) ||
      (rune >= 0x1D173 && rune <= 0x1D17A) ||
      (rune >= 0xE0000 && rune <= 0xE0FFF)) {
    return true;
  }

  // Private-use and noncharacter code points are not printable user input.
  if ((rune >= 0xE000 && rune <= 0xF8FF) ||
      (rune >= 0xF0000 && rune <= 0xFFFFD) ||
      (rune >= 0x100000 && rune <= 0x10FFFD) ||
      (rune >= 0xFDD0 && rune <= 0xFDEF) ||
      (rune & 0xFFFF) == 0xFFFE ||
      (rune & 0xFFFF) == 0xFFFF) {
    return true;
  }

  return false;
}

/// Extracts deposit routing information from a Stellar payment input.
/// Following the standard priority policy, M-address identifiers take
/// precedence over any provided memo.
///
/// Web safety: routing IDs are resolved through [SafeRoutingId], which
/// parses the canonical decimal **string** exactly and never converts
/// through `int`/JS `Number`. Combined with the `BigInt`-backed
/// [RoutingResult.id], [RoutingResult.idString], and
/// [RoutingResult.safeId] accessors, MEMO_IDs and muxed IDs up to the
/// uint64 ceiling survive Flutter Web without truncation.
///
/// This is the synchronous variant for pure string parsing.
/// For future compatibility with async network checks (Federation, SEP-0029),
/// use [extractRouting] instead.
RoutingResult extractRoutingSync(RoutingInput input) {
  final sanitized = _sanitizeDestination(input.destination);
  final destination = sanitized.value;
  if (destination.isEmpty) {
    throw const ExtractRoutingException(
      'Invalid input: destination must be a non-empty string.',
    );
  }

  final prefix = destination[0].toUpperCase();
  if (prefix != 'G' && prefix != 'M') {
    throw ExtractRoutingException(
      'Invalid destination: expected a G or M address, got "$destination".',
    );
  }

  final sanitizationWarnings = sanitized.modified
      ? <RoutingWarning>[RoutingWarning.sanitizedHiddenChars]
      : <RoutingWarning>[];

  if (input.sourceAccount != null && input.sourceAccount!.isNotEmpty) {
    try {
      final source = parse(input.sourceAccount!);
      if (source.kind == codes.AddressKind.c) {
        return RoutingResult(
          source: RoutingSource.none,
          warnings: [...sanitizationWarnings, RoutingWarning.contractSender],
        );
      }
    } catch (_) {
      // Ignore source account parsing errors for routing extraction
    }
  }

  final parsed = parse(destination);

  if (parsed.kind == null) {
    return RoutingResult(
      source: RoutingSource.none,
      warnings: sanitizationWarnings,
      destinationError: parsed.error != null
          ? DestinationError(
              code: parsed.error!.code,
              message: parsed.error!.message,
            )
          : null,
    );
  }

  final warnings = <RoutingWarning>[...sanitizationWarnings];
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
        routingId = SafeRoutingId.tryParse(norm.normalized!)?.toBigInt;
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
        routingId = SafeRoutingId.tryParse(norm.normalized!)?.toBigInt;
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
      routingId = SafeRoutingId.tryParse(norm.normalized!)?.toBigInt;
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
      routingId = SafeRoutingId.tryParse(norm.normalized!)?.toBigInt;
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
typedef MemoRequirementFetcher = Future<bool> Function(String baseAccount);

/// Performs routing extraction and optionally checks a destination's SEP-0029
/// memo requirement. Fetch failures fail open to preserve parser behavior.
Future<RoutingResult> extractRouting(
  RoutingInput input, {
  MemoRequirementFetcher? fetchMemoRequirement,
}) async {
  final result = extractRoutingSync(input);
  if (fetchMemoRequirement == null ||
      result.destinationBaseAccount == null ||
      result.id != null ||
      result.destinationError != null) {
    return result;
  }

  try {
    if (await fetchMemoRequirement(result.destinationBaseAccount!)) {
      return RoutingResult(
        source: result.source,
        id: result.id,
        destinationBaseAccount: result.destinationBaseAccount,
        destinationError: result.destinationError,
        warnings: [...result.warnings, RoutingWarning.missingRequiredMemo],
      );
    }
  } catch (_) {
    // Network/configuration failures must not change the synchronous result.
  }
  return result;
}
