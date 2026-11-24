// Warning severity categorisation, minSeverityLevel filtering and structured
// payloads (issue #357). Mirrors core-ts src/test/severity.test.ts and
// core-go address/severity_test.go + routing/severity_filter_test.go.
import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

const g = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
final gLower = g.toLowerCase();

const canonical = {
  'SANITIZED_HIDDEN_CHARS': 'info',
  'CONTRACT_SENDER_DETECTED': 'info',
  'MEMO_IGNORED_FOR_MUXED': 'info',
  'NON_CANONICAL_ADDRESS': 'warn',
  'NON_CANONICAL_ROUTING_ID': 'warn',
  'MEMO_PRESENT_WITH_MUXED': 'warn',
  'MEMO_TEXT_UNROUTABLE': 'warn',
  'MEMO_ID_INVALID_FORMAT': 'warn',
  'UNSUPPORTED_MEMO_TYPE': 'warn',
  'INVALID_DESTINATION': 'error',
  'MISSING_REQUIRED_MEMO': 'error',
};

RoutingResult route({
  String destination = g,
  String memoType = 'none',
  String? memoValue,
  String? minSeverityLevel,
}) =>
    extractRoutingSync(RoutingInput(
      destination: destination,
      memoType: memoType,
      memoValue: memoValue,
      minSeverityLevel: minSeverityLevel,
    ));

List<String> codesOf(RoutingResult r) => r.warnings.map((w) => w.code).toList();

void main() {
  group('WarningSeverity', () {
    test('catalog matches core-ts and core-go', () {
      canonical.forEach((code, severity) {
        expect(WarningSeverity.forCode(code), severity, reason: code);
      });
      expect(WarningSeverity.forCode('NOT_A_CODE'), isNull);
    });

    test('ranks info < warn < error; unknown ranks as info', () {
      expect(WarningSeverity.values.map(WarningSeverity.rank), [0, 1, 2]);
      expect(WarningSeverity.rank('fatal'), 0);
      expect(WarningSeverity.rank(null), 0);
    });

    test('built-in routing warnings use the catalog severity', () {
      for (final w in [
        RoutingWarning.memoIgnored,
        RoutingWarning.contractSender,
        RoutingWarning.missingRequiredMemo,
        RoutingWarning.sanitizedHiddenChars,
      ]) {
        expect(w.severity, WarningSeverity.forCode(w.code), reason: w.code);
      }
    });
  });

  group('filterWarningsBySeverity', () {
    const ws = [
      RoutingWarning(code: 'a', severity: 'info', message: ''),
      RoutingWarning(code: 'b', severity: 'error', message: ''),
      RoutingWarning(code: 'c', severity: 'warn', message: ''),
    ];
    final cases = <String?, List<String>>{
      'info': ['a', 'b', 'c'],
      'warn': ['b', 'c'],
      'error': ['b'],
      null: ['a', 'b', 'c'],
      'bogus': ['a', 'b', 'c'],
    };
    cases.forEach((min, want) {
      test('min $min keeps $want', () {
        expect(filterWarningsBySeverity(ws, min).map((w) => w.code), want);
      });
    });
  });

  group('minSeverityLevel on extractRouting', () {
    // SANITIZED_HIDDEN_CHARS (info), NON_CANONICAL_ADDRESS (warn),
    // NON_CANONICAL_ROUTING_ID (warn).
    RoutingResult noisy(String? min) => route(
          destination: ' $gLower ',
          memoType: 'id',
          memoValue: '0042',
          minSeverityLevel: min,
        );

    test('defaults to info', () {
      expect(codesOf(noisy(null)), [
        'SANITIZED_HIDDEN_CHARS',
        'NON_CANONICAL_ADDRESS',
        'NON_CANONICAL_ROUTING_ID',
      ]);
    });

    test('warn drops info only', () {
      expect(codesOf(noisy(WarningSeverity.warn)),
          ['NON_CANONICAL_ADDRESS', 'NON_CANONICAL_ROUTING_ID']);
    });

    test('error drops everything here but never changes routing', () {
      final r = noisy(WarningSeverity.error);
      expect(r.warnings, isEmpty);
      expect(r.idString, '42');
      expect(r.source, RoutingSource.memo);
      expect(r.destinationBaseAccount, g);
    });

    test('async variant keeps MISSING_REQUIRED_MEMO at error threshold',
        () async {
      final r = await extractRouting(
        RoutingInput(
          destination: ' $g',
          memoType: 'none',
          minSeverityLevel: WarningSeverity.error,
        ),
        fetchMemoRequirement: (_) async => true,
      );
      expect(codesOf(r), ['MISSING_REQUIRED_MEMO']);
    });

    test('async variant filters when no memo is required', () async {
      final r = await extractRouting(
        RoutingInput(
          destination: ' $g',
          memoType: 'none',
          minSeverityLevel: WarningSeverity.warn,
        ),
        fetchMemoRequirement: (_) async => false,
      );
      expect(r.warnings, isEmpty);
    });
  });

  group('structured payloads', () {
    test('NON_CANONICAL_ADDRESS carries { original, normalized }', () {
      final w = route(destination: gLower).warnings.single;
      expect(w.toJson(), {
        'code': 'NON_CANONICAL_ADDRESS',
        'severity': 'warn',
        'message': 'Address normalized to uppercase',
        'normalization': {'original': gLower, 'normalized': g},
      });
    });

    test('NON_CANONICAL_ROUTING_ID carries { original, normalized }', () {
      final w = route(memoType: 'id', memoValue: '007').warnings.single;
      expect(w.code, 'NON_CANONICAL_ROUTING_ID');
      expect(w.severity, 'warn');
      expect(w.normalization,
          const Normalization(original: '007', normalized: '7'));
    });

    for (final c in [
      ['hash', 'hash', 'Memo type hash is not supported for routing.'],
      ['return', 'return', 'Memo type return is not supported for routing.'],
      ['MEMO_FOO', 'unknown', 'Unrecognized memo type: MEMO_FOO'],
    ]) {
      test('UNSUPPORTED_MEMO_TYPE for ${c[0]} reports memoType ${c[1]}', () {
        final w = route(memoType: c[0], memoValue: 'x').warnings.single;
        expect(w.toJson(), {
          'code': 'UNSUPPORTED_MEMO_TYPE',
          'severity': 'warn',
          'message': c[2],
          'context': {'memoType': c[1]},
        });
      });
    }

    test('payloads take part in equality', () {
      const a = RoutingWarning(
        code: 'UNSUPPORTED_MEMO_TYPE',
        severity: 'warn',
        message: 'm',
        context: WarningContext(memoType: 'hash'),
      );
      const b = RoutingWarning(
        code: 'UNSUPPORTED_MEMO_TYPE',
        severity: 'warn',
        message: 'm',
        context: WarningContext(memoType: 'return'),
      );
      expect(a == b, isFalse);
      expect(
          a,
          const RoutingWarning(
            code: 'UNSUPPORTED_MEMO_TYPE',
            severity: 'warn',
            message: 'm',
            context: WarningContext(memoType: 'hash'),
          ));
    });
  });
}
