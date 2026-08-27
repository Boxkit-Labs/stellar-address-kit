// Flutter Web routing-ID precision test vectors.
//
// These vectors run *only in a real browser* (`@TestOn('browser')`; CI runs
// them via `dart test test/web_compat --platform chrome`). They assert that
// 64-bit routing IDs above `Number.MAX_SAFE_INTEGER` are handled as exact
// decimal strings / BigInts and never silently truncated by JavaScript
// `Number` semantics.
//
// Run locally:
//   dart test test/web_compat --platform chrome
@TestOn('browser')

import 'dart:convert';

import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

void main() {
  // Stable vector account (same base as the shared spec suite).
  const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

  /// Fixed Flutter Web test vectors: decimal ID -> precomputed SEP-23
  /// muxed address for [baseG]. Generated independently of the code under
  /// test, so any regression in encode/decode breaks the expected string.
  const muxedVectors = <String, String>{
    '0': 'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672',
    '1': 'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAHOO2',
    // 2^53 - 1 — Number.MAX_SAFE_INTEGER, last exactly representable odd ID.
    '9007199254740991':
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAA77777777776YNO',
    // 2^53 — first integer outside the JS safe range.
    '9007199254740992':
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAAFZG',
    // 2^53 + 1 — the classic precision canary: a JS Number rounds it down to
    // 2^53, which would route a deposit to the wrong user ID.
    '9007199254740993':
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG',
    // 2^63 - 1 — int64 max.
    '9223372036854775807':
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQAC7777777777776O2M',
    // 2^63 — unsigned-only territory.
    '9223372036854775808':
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADAAAAAAAAAAAAB6AA',
    // 2^64 - 1 — uint64 max.
    '18446744073709551615':
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQAD7777777777774OFW',
  };

  group('browser runtime detection (conditional compilation)', () {
    test('isWebJsRuntime is true inside the browser', () {
      expect(isWebJsRuntime, isTrue,
          reason: 'The dart.library.html conditional import must select the '
              'web implementation on a browser platform.');
    });
  });

  group('JS Number truncation canary (the bug this fix prevents)', () {
    test('int.parse silently truncates 2^53 + 1 in a browser', () {
      // Proof of the hazard: plain Dart `int` is a JS Number here, so the
      // canary ID loses its lowest bit with no error whatsoever.
      final truncated = int.parse('9007199254740993');
      expect(truncated.toString(), isNot('9007199254740993'));
      expect(BigInt.from(truncated).toString(), equals('9007199254740992'));
    });

    test('SafeRoutingId keeps 2^53 + 1 exact in a browser', () {
      final safe = SafeRoutingId.parse('9007199254740993');
      expect(safe.value, equals('9007199254740993'));
      expect(safe.toBigInt.toString(), equals('9007199254740993'));
      // Must differ from the truncated JS Number value.
      expect(safe.toBigInt, isNot(BigInt.from(int.parse('9007199254740993'))));
      expect(safe.exceedsJsSafeRange, isTrue);
    });

    test('SafeRoutingId.fromInt refuses JS-unsafe ints instead of truncating',
        () {
      // A dart2js int can still hold 2^53 exactly (it is a power of two),
      // but it can never be trusted: its odd neighbor 2^53 + 1 is
      // indistinguishable from it after rounding. fromInt therefore rejects
      // every value above Number.MAX_SAFE_INTEGER on web builds.
      expect(() => SafeRoutingId.fromInt(9007199254740992), throwsArgumentError);

      // Note: the *literal* `9007199254740993` does not even compile under
      // dart2js ("can't be represented exactly in JavaScript"). At runtime,
      // int.parse silently rounds it down to 2^53 — fromInt rejects that
      // rounded double too, instead of propagating a wrong ID.
      final silentlyRounded = int.parse('9007199254740993');
      expect(silentlyRounded, equals(9007199254740992));
      expect(() => SafeRoutingId.fromInt(silentlyRounded), throwsArgumentError);
    });

    test('fromInt accepts values within Number.MAX_SAFE_INTEGER', () {
      final safe = SafeRoutingId.fromInt(9007199254740991);
      expect(safe.value, equals('9007199254740991'));
      expect(safe.isJsSafe, isTrue);
      expect(safe.exceedsJsSafeRange, isFalse);
    });
  });

  group('MEMO_ID extraction vectors survive the browser', () {
    for (final entry in muxedVectors.entries) {
      final idText = entry.key;
      test('G-address + MEMO_ID "$idText" parses exactly', () {
        final result = extractRoutingSync(RoutingInput(
          destination: baseG,
          memoType: 'id',
          memoValue: idText,
        ));

        expect(result.source, equals(RoutingSource.memo));
        expect(result.id.toString(), equals(idText),
            reason: 'RoutingResult.id must be exact for "$idText" on web.');
        expect(result.idString, equals(idText));
        expect(result.safeId?.value, equals(idText));
        expect(result.safeId?.toBigInt.toString(), equals(idText));
      });
    }

    test('MEMO_TEXT numeric routing ID stays exact above 2^53', () {
      const idText = '18446744073709551615'; // uint64 max
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'text',
        memoValue: idText,
      ));

      expect(result.source, equals(RoutingSource.memo));
      expect(result.idString, equals(idText));
      expect(result.id.toString(), equals(idText));
    });

    test('out-of-range MEMO_ID (uint64 max + 1) is rejected, not truncated',
        () {
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'id',
        memoValue: '18446744073709551616',
      ));

      expect(result.source, equals(RoutingSource.none));
      expect(result.id, isNull);
      expect(result.idString, isNull);
      expect(result.safeId, isNull);
      expect(
        result.warnings.map((w) => w.code),
        contains('MEMO_ID_INVALID_FORMAT'),
      );
    });

    test('leading-zero MEMO_ID normalizes with a warning, exactly', () {
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'id',
        memoValue: '09007199254740993',
      ));

      expect(result.source, equals(RoutingSource.memo));
      expect(result.idString, equals('9007199254740993'));
      expect(
        result.warnings.map((w) => w.code),
        contains('NON_CANONICAL_ROUTING_ID'),
      );
    });
  });

  group('muxed address vectors survive the browser', () {
    for (final entry in muxedVectors.entries) {
      final idText = entry.key;
      final mAddress = entry.value;
      test('decode("$mAddress") yields exactly $idText', () {
        expect(MuxedAddress.encode(baseG: baseG, id: BigInt.parse(idText)),
            equals(mAddress),
            reason: 'Encoding must reproduce the precomputed vector.');

        final decoded = MuxedAddress.decode(mAddress);
        expect(decoded.baseG, equals(baseG));
        expect(decoded.id.toString(), equals(idText),
            reason: 'Muxed decode must not truncate "$idText" on web.');
      });

      test('extractRoutingSync routes muxed "$mAddress" to $idText', () {
        final result = extractRoutingSync(
          RoutingInput(destination: mAddress, memoType: 'none'),
        );
        expect(result.source, equals(RoutingSource.muxed));
        expect(result.idString, equals(idText));
        expect(result.destinationBaseAccount, equals(baseG));
      });
    }
  });

  group('browser-safe JSON serialization', () {
    test('SafeRoutingId serializes as an exact decimal string', () {
      final payload = jsonEncode({
        'routing_id': SafeRoutingId.parse('9007199254740993'),
      });
      expect(payload, equals('{"routing_id":"9007199254740993"}'),
          reason: 'Strings — never JS Numbers — must cross the wire.');
    });

    test('RoutingResult.safeId round-trips through JSON exactly', () {
      final result = extractRoutingSync(RoutingInput(
        destination: baseG,
        memoType: 'id',
        memoValue: '18446744073709551615',
      ));
      final encoded = jsonEncode({'routing_id': result.safeId});
      final decoded = jsonDecode(encoded) as Map<String, dynamic>;

      expect(encoded, equals('{"routing_id":"18446744073709551615"}'));
      expect(SafeRoutingId.tryParse(decoded['routing_id'] as String)?.value,
          equals('18446744073709551615'));
    });
  });
}
