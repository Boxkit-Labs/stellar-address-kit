import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

void main() {
  const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
  const muxedAddress =
      'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG';

  group('extractRoutingSync', () {
    test('decodes muxed routing when no external memo is present', () {
      final result = extractRoutingSync(
        RoutingInput(destination: muxedAddress, memoType: 'none'),
      );

      expect(result.destinationBaseAccount, baseG);
      expect(result.id, BigInt.parse('9007199254740993'));
      expect(result.source, RoutingSource.muxed);
      expect(result.warnings, isEmpty);
      expect(result.destinationError, isNull);
    });

    test('prefers external memo over muxed routing and emits memo-ignored warning', () {
      final result = extractRoutingSync(
        RoutingInput(
          destination: muxedAddress,
          memoType: 'id',
          memoValue: '42',
        ),
      );

      expect(result.destinationBaseAccount, baseG);
      expect(result.id, BigInt.from(42));
      expect(result.source, RoutingSource.memo);
      expect(result.destinationError, isNull);
      expect(result.warnings, hasLength(1));
      expect(result.warnings.first.code, 'memo-ignored');
    });

    test('keeps muxed decode valid when external memo is unroutable', () {
      final result = extractRoutingSync(
        RoutingInput(
          destination: muxedAddress,
          memoType: 'text',
          memoValue: 'not-a-routing-id',
        ),
      );

      expect(result.destinationBaseAccount, baseG);
      expect(result.id, isNull);
      expect(result.source, RoutingSource.none);
      expect(result.destinationError, isNull);
      expect(
        result.warnings.map((warning) => warning.code),
        ['memo-ignored', 'MEMO_TEXT_UNROUTABLE'],
      );
    });

    test('preserves existing non-muxed memo routing behavior', () {
      final result = extractRoutingSync(
        RoutingInput(
          destination: baseG,
          memoType: 'id',
          memoValue: '100',
        ),
      );

      expect(result.destinationBaseAccount, baseG);
      expect(result.id, BigInt.from(100));
      expect(result.source, RoutingSource.memo);
      expect(result.warnings, isEmpty);
      expect(result.destinationError, isNull);
    });

    test('throws ExtractRoutingException for C-addresses', () {
      const cAddress = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      expect(
        () => extractRoutingSync(RoutingInput(destination: cAddress, memoType: 'none')),
        throwsA(isA<ExtractRoutingException>()),
      );
    });

    test('throws ExtractRoutingException for empty destination', () {
      expect(
        () => extractRoutingSync(RoutingInput(destination: '', memoType: 'none')),
        throwsA(isA<ExtractRoutingException>()),
      );
    });
  });

  group('extractRouting (async)', () {
    test('decodes muxed routing when no external memo is present', () async {
      await expectLater(
        extractRouting(RoutingInput(destination: muxedAddress, memoType: 'none')),
        completion(predicate((RoutingResult result) =>
            result.destinationBaseAccount == baseG &&
            result.id == BigInt.parse('9007199254740993') &&
            result.source == RoutingSource.muxed &&
            result.warnings.isEmpty &&
            result.destinationError == null)),
      );
    });

    test('prefers external memo over muxed routing and emits memo-ignored warning', () async {
      await expectLater(
        extractRouting(RoutingInput(
          destination: muxedAddress,
          memoType: 'id',
          memoValue: '42',
        )),
        completion(predicate((RoutingResult result) =>
            result.destinationBaseAccount == baseG &&
            result.id == BigInt.from(42) &&
            result.source == RoutingSource.memo &&
            result.destinationError == null &&
            result.warnings.length == 1 &&
            result.warnings.first.code == 'memo-ignored')),
      );
    });

    test('keeps muxed decode valid when external memo is unroutable', () async {
      await expectLater(
        extractRouting(RoutingInput(
          destination: muxedAddress,
          memoType: 'text',
          memoValue: 'not-a-routing-id',
        )),
        completion(predicate((RoutingResult result) =>
            result.destinationBaseAccount == baseG &&
            result.id == null &&
            result.source == RoutingSource.none &&
            result.destinationError == null &&
            result.warnings.map((w) => w.code).toList() ==
                ['memo-ignored', 'MEMO_TEXT_UNROUTABLE'])),
      );
    });

    test('preserves existing non-muxed memo routing behavior', () async {
      await expectLater(
        extractRouting(RoutingInput(
          destination: baseG,
          memoType: 'id',
          memoValue: '100',
        )),
        completion(predicate((RoutingResult result) =>
            result.destinationBaseAccount == baseG &&
            result.id == BigInt.from(100) &&
            result.source == RoutingSource.memo &&
            result.warnings.isEmpty &&
            result.destinationError == null)),
      );
    });

    test('propagates ExtractRoutingException for C-addresses as a Future error', () async {
      const cAddress = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      await expectLater(
        () => extractRouting(RoutingInput(destination: cAddress, memoType: 'none')),
        throwsA(isA<ExtractRoutingException>()),
      );
    });

    test('propagates ExtractRoutingException for empty destination as a Future error', () async {
      await expectLater(
        () => extractRouting(RoutingInput(destination: '', memoType: 'none')),
        throwsA(isA<ExtractRoutingException>()),
      );
    });
  });
}
