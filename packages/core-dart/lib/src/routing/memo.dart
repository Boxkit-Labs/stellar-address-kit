import '../address/codes.dart';

class NormalizeResult {
  final String? normalized;
  final List<Warning> warnings;

  NormalizeResult({this.normalized, required this.warnings});
}

final BigInt uint64Max = BigInt.parse('18446744073709551615');
final RegExp digitsOnly = RegExp(r'^\d+$');

/// Strict normalizer for MEMO_ID type.
/// A MEMO_ID must be a non-empty string of digits parseable as a uint64.
/// Leading zeros are invalid (except the canonical "0").
/// Returns null if the value cannot be used as a routing ID.
NormalizeResult normalizeMemoId(String s) {
  final warnings = <Warning>[];

  // Reject blank or non-digit strings
  if (s.isEmpty || !digitsOnly.hasMatch(s)) {
    return NormalizeResult(normalized: null, warnings: warnings);
  }

  // Reject leading zeros (e.g. "007" is invalid for a strict MEMO_ID)
  if (s.length > 1 && s.startsWith('0')) {
    warnings.add(
      Warning(
        code: WarningCode.nonCanonicalRoutingId,
        severity: 'warn',
        message:
            'Memo routing ID had leading zeros. Normalized to canonical decimal.',
        normalization: Normalization(
          original: s,
          normalized: BigInt.parse(s).toString(),
        ),
      ),
    );
    // Strip zeros and re-normalize for the returned value
    final stripped = BigInt.parse(s).toString();
    try {
      final val = BigInt.parse(stripped);
      if (val > uint64Max) {
        return NormalizeResult(normalized: null, warnings: warnings);
      }
    } catch (_) {
      return NormalizeResult(normalized: null, warnings: warnings);
    }
    return NormalizeResult(normalized: stripped, warnings: warnings);
  }

  // Validate uint64 range
  try {
    final val = BigInt.parse(s);
    if (val > uint64Max) {
      return NormalizeResult(normalized: null, warnings: warnings);
    }
  } catch (_) {
    return NormalizeResult(normalized: null, warnings: warnings);
  }

  return NormalizeResult(normalized: s, warnings: warnings);
}

/// Normalizer for MEMO_TEXT type — tries to parse a numeric routing ID.
/// Leading zeros trigger a normalization warning; non-numeric values return null.
NormalizeResult normalizeMemoTextId(String s) {
  final warnings = <Warning>[];

  // Step 1, 2, 3: Blank, non-digit
  if (s.isEmpty || !digitsOnly.hasMatch(s)) {
    return NormalizeResult(normalized: null, warnings: warnings);
  }

  // Step 4: Leading zeros — normalize and warn
  var normalized = s.replaceFirst(RegExp(r'^0+'), '');
  if (normalized.isEmpty) {
    normalized = '0';
  }

  if (normalized != s) {
    warnings.add(
      Warning(
        code: WarningCode.nonCanonicalRoutingId,
        severity: 'warn',
        message:
            'Memo routing ID had leading zeros. Normalized to canonical decimal.',
        normalization: Normalization(original: s, normalized: normalized),
      ),
    );
  }

  // Step 5: uint64 max
  try {
    final val = BigInt.parse(normalized);
    if (val > uint64Max) {
      return NormalizeResult(normalized: null, warnings: warnings);
    }
  } catch (_) {
    return NormalizeResult(normalized: null, warnings: warnings);
  }

  return NormalizeResult(normalized: normalized, warnings: warnings);
}
