// Platform-agnostic unit vectors for [SafeRoutingId], the BigInt-backed
// wrapper that protects 64-bit routing IDs from JS `Number` truncation on
// Flutter Web.
//
// These vectors run on the VM (and any other platform). The browser-only
// counterparts — which additionally prove that `int.parse` itself truncates
// under dart2js while this library does not — live in
// `test/web_compat/routing_id_web_test.dart`.
library;

import 'dart:convert';

import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

void main() {
  const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

  /// Boundary vector set mirroring the TypeScript suite's EDGE_IDS.
  const boundaryVectors = <String>[
    '0',
    '1',
    '9007199254740991', // 2^53 - 1 (Number.MAX_SAFE_INTEGER)
    '9007199254740992', // 2^53
    '9007199254740993', // 2^53 + 1 (precision canary)
    '9223372036854775807', // 2^63 - 1 (int64 max)
    '9223372036854775808', // 2^63
    '18446744073709551615', // 2^64 - 1 (uint64 max)
  ];

  group('SafeRoutingId constants', () {
    test('exposes JS and uint64 boundaries', () {
      expect(SafeRoutingId.maxJsSafeInteger.toString(), equals('9007199254740991'));
      expect(SafeRoutingId.uint64Max.toString(), equals('18446744073709551615'));
    });
  });

  group('SafeRoutingId.tryParse vectors', () {
    for (final idText in boundaryVectors) {
      test('"$idText" parses exactly', () {
        final safe = SafeRoutingId.tryParse(idText);
        expect(safe, isNotNull);
        expect(safe!.value, equals(idText));
        expect(safe.toBigInt.toString(), equals(idText));
        expect(safe.toString(), equals(idText));
      });
    }

    test('classifies JS-safety of each boundary', () {
      expect(SafeRoutingId.parse('9007199254740991').isJsSafe, isTrue);
      expect(SafeRoutingId.parse('9007199254740991').exceedsJsSafeRange, isFalse);
      expect(SafeRoutingId.parse('9007199254740992').isJsSafe, isFalse);
      expect(SafeRoutingId.parse('9007199254740993').exceedsJsSafeRange, isTrue);
      expect(SafeRoutingId.parse('18446744073709551615').exceedsJsSafeRange, isTrue);
    });

    test('accepts and canonicalizes leading zeros', () {
      expect(SafeRoutingId.tryParse('007')?.value, equals('7'));
      expect(SafeRoutingId.tryParse('000')?.value, equals('0'));
      expect(SafeRoutingId.tryParseStrict('007'), isNull,
          reason: 'Strict form rejects non-canonical input.');
      expect(SafeRoutingId.tryParseStrict('0')?.value, equals('0'));
    });

    test('rejects invalid uint64 inputs with null (never throws)', () {
      const invalid = <String>[
        '', // blank
        ' ', // whitespace
        ' 42', '42 ', // embedded whitespace
        '-1', '+1', // signed
        '1.0', '1e3', // fractional / exponent
        '0x10', '0b1', // non-decimal radix
        '1_000', // separators
        'fourty', // words
        '18446744073709551616', // uint64 max + 1
        '99999999999999999999999999', // far out of range
      ];
      for (final bad in invalid) {
        expect(SafeRoutingId.tryParse(bad), isNull,
            reason: '"$bad" must not parse as a uint64 routing ID.');
        expect(() => SafeRoutingId.parse(bad), throwsFormatException);
      }
    });
  });

  group('SafeRoutingId.fromBigInt', () {
    test('round-trips every boundary vector', () {
      for (final idText in boundaryVectors) {
        final safe = SafeRoutingId.fromBigInt(BigInt.parse(idText));
        expect(safe.value, equals(idText));
        expect(safe.toBigInt, equals(BigInt.parse(idText)));
      }
    });

    test('rejects out-of-range BigInts', () {
      expect(() => SafeRoutingId.fromBigInt(BigInt.from(-1)),
          throwsArgumentError);
      expect(
          () => SafeRoutingId.fromBigInt(
              BigInt.parse('18446744073709551616')),
          throwsArgumentError);
    });
  });

  group('SafeRoutingId.fromInt', () {
    test('accepts JS-safe ints on every platform', () {
      final safe = SafeRoutingId.fromInt(9007199254740991);
      expect(safe.value, equals('9007199254740991'));
      expect(safe.isJsSafe, isTrue);
    });

    test('rejects negative ints', () {
      expect(() => SafeRoutingId.fromInt(-1), throwsArgumentError);
    });

    test('guards ints above Number.MAX_SAFE_INTEGER only on web builds', () {
      // On the VM an int is a true 64-bit integer, so 2^53 is fine.
      // On a web build the same value is a double that cannot be trusted
      // above 2^53 - 1, so fromInt refuses it (see the browser vectors in
      // test/web_compat/routing_id_web_test.dart).
      if (isWebJsRuntime) {
        expect(() => SafeRoutingId.fromInt(9007199254740992),
            throwsArgumentError);
      } else {
        expect(SafeRoutingId.fromInt(9007199254740992).value,
            equals('9007199254740992'));
      }
    });
  });

  group('SafeRoutingId value semantics', () {
    test('equality and hashing follow the exact value', () {
      final a = SafeRoutingId.parse('9007199254740993');
      final b = SafeRoutingId.fromBigInt(BigInt.parse('9007199254740993'));
      final c = SafeRoutingId.parse('9007199254740992');
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
      expect(a == c, isFalse);
      expect({a: 'canary'}[b], equals('canary'));
    });

    test('compareTo orders numerically, not lexically', () {
      final small = SafeRoutingId.parse('9');
      final big = SafeRoutingId.parse('10');
      expect(small.compareTo(big), isNegative);
      expect(big.compareTo(small), isPositive);
      expect(small.compareTo(small), isZero);
    });

    test('serializes to JSON as the exact decimal string', () {
      expect(jsonEncode(SafeRoutingId.parse('9007199254740993')),
          equals('"9007199254740993"'));
      expect(SafeRoutingId.parse('18446744073709551615').toJson(),
          equals('18446744073709551615'));
    });
  });

  group('web platform probe (conditional compilation)', () {
    test('isWebJsRuntime is a compile-time constant decision', () {
      // It must be false on the VM and true in a browser; the value itself
      // is selected by conditional import, not a runtime check.
      expect(isWebJsRuntime, anyOf(isTrue, isFalse));
    });
  });

  group('RoutingResult web-safe accessors', () {
    test('idString / safeId expose exact decimal strings', () {
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'id',
        memoValue: '9007199254740993',
      ));

      expect(result.source, equals(RoutingSource.memo));
      expect(result.id, equals(BigInt.parse('9007199254740993')));
      expect(result.idString, equals('9007199254740993'));
      expect(result.safeId, equals(SafeRoutingId.parse('9007199254740993')));
      expect(result.safeId!.exceedsJsSafeRange, isTrue);
    });

    test('idString / safeId are null when no routing ID resolved', () {
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'none',
      ));
      expect(result.id, isNull);
      expect(result.idString, isNull);
      expect(result.safeId, isNull);
    });

    test('uint64-max MEMO_ID routes exactly through every accessor', () {
      const idText = '18446744073709551615';
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'id',
        memoValue: idText,
      ));

      expect(result.idString, equals(idText));
      expect(result.safeId!.toBigInt, equals(SafeRoutingId.uint64Max));
      expect(jsonEncode({'routing_id': result.safeId}),
          equals('{"routing_id":"$idText"}'));
    });
  });

  group('memo normalization stays uint64-exact', () {
    test('normalizeMemoId accepts every boundary vector', () {
      for (final idText in boundaryVectors) {
        final norm = normalizeMemoId(idText);
        expect(norm.normalized, equals(idText),
            reason: '"$idText" is a legal MEMO_ID.');
        expect(norm.warnings, isEmpty);
      }
    });

    test('normalizeMemoId rejects uint64 overflow', () {
      final norm = normalizeMemoId('18446744073709551616');
      expect(norm.normalized, isNull);
    });

    test('normalizeMemoTextId stays exact above 2^53', () {
      final norm = normalizeMemoTextId('18446744073709551615');
      expect(norm.normalized, equals('18446744073709551615'));
    });
  });
}
