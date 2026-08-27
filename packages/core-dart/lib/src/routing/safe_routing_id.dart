import '../util/web_platform.dart';

/// A precision-safe wrapper for 64-bit Stellar routing IDs (MEMO_ID and
/// muxed account IDs).
///
/// ## Why this type exists
///
/// On mobile and desktop targets, Dart `int` is a native 64-bit integer, so
/// a MEMO_ID such as `9007199254740993` survives any conversion. When the
/// same code is compiled for **Flutter Web** (dart2js / DDC), however, every
/// Dart `int` becomes a JavaScript `Number` (an IEEE-754 double), which can
/// only represent integers exactly up to `Number.MAX_SAFE_INTEGER`
/// (`2^53 - 1` = `9007199254740991`). Routing IDs above that ceiling — and
/// muxed IDs may legally range up to `2^64 - 1` — are **silently truncated**:
///
/// ```dart
/// // On Flutter Web this evaluates to 9007199254740992 — one unit off, with
/// // no error, no warning. Funds could be credited to the wrong user.
/// int.parse('9007199254740993');
/// ```
///
/// ## The guarantee
///
/// [SafeRoutingId] holds the value canonically as a decimal string (with a
/// lazily materialized [BigInt] view) and **never** routes it through
/// `int`/`num`/JS `Number`. Parsing, equality, ordering, hashing, and JSON
/// serialization are therefore bit-exact on every platform, including
/// browser contexts:
///
/// ```dart
/// final id = SafeRoutingId.parse('9007199254740993'); // exact on web too
/// id.value;      // '9007199254740993'  (canonical decimal string)
/// id.toBigInt;   // BigInt.parse('9007199254740993')
/// id.toJson();   // '9007199254740993'  (string — safe to jsonEncode)
/// id.isJsSafe;   // false — exceeds Number.MAX_SAFE_INTEGER
/// ```
///
/// Prefer [parse]/[tryParse] with the **string** form in browser contexts;
/// use [fromBigInt] when you already hold a `BigInt`; use [fromInt] only for
/// values that were never serialized — it refuses values that JS `Number`
/// semantics cannot carry exactly when [isWebJsRuntime] is `true`.
class SafeRoutingId implements Comparable<SafeRoutingId> {
  /// `2^53 - 1` — JavaScript's `Number.MAX_SAFE_INTEGER`.
  ///
  /// Values greater than this cannot be represented exactly by a JS
  /// `Number`, which is what Dart `int` compiles to on Flutter Web.
  static final BigInt maxJsSafeInteger = BigInt.parse('9007199254740991');

  /// `2^64 - 1` — the largest legal Stellar routing ID (uint64).
  static final BigInt uint64Max = BigInt.parse('18446744073709551615');

  /// The canonical decimal digits of the ID (no sign, no leading zeros).
  final String _digits;

  /// The exact BigInt value, computed once at construction.
  final BigInt _value;

  const SafeRoutingId._(this._digits, this._value);

  /// Parses [input] into an exact routing ID.
  ///
  /// [input] must be a canonical, unsigned decimal string within the uint64
  /// range (optionally with leading zeros, which are normalized away for
  /// convenience — use [parseStrict] to reject them instead).
  ///
  /// The value is parsed **as a string** and validated without ever passing
  /// through `int`/JS `Number`, so the full uint64 range survives on
  /// Flutter Web.
  ///
  /// Throws a [FormatException] for blank, non-digit, signed, fractional,
  /// or out-of-range input. Use [tryParse] for a non-throwing variant.
  factory SafeRoutingId.parse(String input) {
    final parsed = tryParse(input);
    if (parsed == null) {
      throw FormatException(
        'Invalid uint64 routing ID "$input": expected canonical decimal '
        'digits in the range 0..18446744073709551615.',
        input,
      );
    }
    return parsed;
  }

  /// Like [parse], but additionally rejects non-canonical input such as
  /// leading zeros (`"007"`), mirroring the strict MEMO_ID policy.
  factory SafeRoutingId.parseStrict(String input) {
    final parsed = tryParseStrict(input);
    if (parsed == null) {
      throw FormatException(
        'Non-canonical uint64 routing ID "$input".',
        input,
      );
    }
    return parsed;
  }

  /// Parses [input] without throwing, returning `null` when [input] is not
  /// a usable uint64 routing ID.
  ///
  /// Leading zeros are tolerated and normalized (`"007"` → `"7"`); use
  /// [tryParseStrict] to reject them.
  static SafeRoutingId? tryParse(String input) {
    final canonical = _canonicalize(input);
    if (canonical == null) return null;
    if (!_withinUint64(canonical)) return null;
    return SafeRoutingId._(canonical, BigInt.parse(canonical));
  }

  /// Like [tryParse], but returns `null` for non-canonical decimal strings
  /// (leading zeros other than a lone `"0"`).
  static SafeRoutingId? tryParseStrict(String input) {
    if (input.isEmpty) return null;
    if (input.length > 1 && input.startsWith('0')) return null;
    return tryParse(input);
  }

  /// Wraps a [BigInt] routing ID, verifying it fits the uint64 range.
  ///
  /// Throws [ArgumentError] for negative values or values above
  /// [uint64Max]. `BigInt` arithmetic is exact on every Dart target,
  /// including Flutter Web, so this constructor is always lossless.
  factory SafeRoutingId.fromBigInt(BigInt value) {
    if (value < BigInt.zero || value > uint64Max) {
      throw ArgumentError.value(
        value,
        'value',
        'Routing ID must fit the uint64 range 0..18446744073709551615.',
      );
    }
    return SafeRoutingId._(value.toString(), value);
  }

  /// Wraps a Dart `int` routing ID.
  ///
  /// **Flutter Web caveat:** when [isWebJsRuntime] is `true`, an `int` is a
  /// JS `Number` and any value above [maxJsSafeInteger] may already have
  /// been silently truncated before it reached this constructor. Rather
  /// than propagating a corrupted ID, this constructor rejects such values
  /// — parse the original decimal string with [parse] instead.
  ///
  /// On native targets the full int64 range is accepted (values between
  /// `2^63 - 1` and [uint64Max] can only be expressed via `BigInt` or
  /// strings, since Dart's native `int` is signed).
  factory SafeRoutingId.fromInt(int value) {
    if (value < 0) {
      throw ArgumentError.value(value, 'value', 'Routing IDs must be non-negative.');
    }
    if (isWebJsRuntime && value > 9007199254740991) {
      throw ArgumentError.value(
        value,
        'value',
        'On Flutter Web an int is a JS Number and cannot be trusted above '
        '9007199254740991 (Number.MAX_SAFE_INTEGER). Parse the routing ID '
        'from its decimal string with SafeRoutingId.parse instead.',
      );
    }
    if (BigInt.from(value) > uint64Max) {
      throw ArgumentError.value(
        value,
        'value',
        'Routing ID must fit the uint64 range 0..18446744073709551615.',
      );
    }
    return SafeRoutingId._(value.toString(), BigInt.from(value));
  }

  static final RegExp _digitsOnly = RegExp(r'^\d+$');

  /// Normalizes a decimal string to canonical form (strips leading zeros),
  /// or returns `null` when it is not pure digits.
  static String? _canonicalize(String input) {
    if (input.isEmpty || !_digitsOnly.hasMatch(input)) return null;
    var canonical = input.replaceFirst(RegExp(r'^0+'), '');
    if (canonical.isEmpty) canonical = '0';
    return canonical;
  }

  /// Length-first uint64 range check on a canonical digit string — exact on
  /// every platform because it never converts to a number.
  static bool _withinUint64(String canonical) {
    const maxDigits = '18446744073709551615';
    if (canonical.length < maxDigits.length) return true;
    if (canonical.length > maxDigits.length) return false;
    return canonical.compareTo(maxDigits) <= 0;
  }

  /// The exact, canonical decimal string for this routing ID.
  ///
  /// This is the recommended serialization for browser contexts and for
  /// JSON payloads: strings never cross the JS `Number` boundary.
  String get value => _digits;

  /// The exact [BigInt] value. `BigInt` is exact on all Dart targets,
  /// including Flutter Web.
  BigInt get toBigInt => _value;

  /// Whether this ID is at or below `Number.MAX_SAFE_INTEGER`
  /// (`9007199254740991`) and therefore round-trips safely through a JS
  /// `Number` / Dart `int` on Flutter Web.
  bool get isJsSafe => _withinMaxSafe(_digits);

  /// Whether this ID is above `Number.MAX_SAFE_INTEGER`. Such IDs are fully
  /// supported by this wrapper but must never be converted to `int`/`num`
  /// in a browser context.
  bool get exceedsJsSafeRange => !isJsSafe;

  static bool _withinMaxSafe(String digits) {
    const safeDigits = '9007199254740991';
    if (digits.length < safeDigits.length) return true;
    if (digits.length > safeDigits.length) return false;
    return digits.compareTo(safeDigits) <= 0;
  }

  /// Serializes to JSON as the exact decimal string — safe to embed
  /// directly in `jsonEncode` output on every platform.
  String toJson() => _digits;

  @override
  String toString() => _digits;

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is SafeRoutingId && other._digits == _digits);

  @override
  int get hashCode => _digits.hashCode;

  @override
  int compareTo(SafeRoutingId other) => toBigInt.compareTo(other.toBigInt);
}
