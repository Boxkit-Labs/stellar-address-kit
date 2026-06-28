import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:stellar_address_kit/src/address/codes.dart' as codes;
import 'package:test/test.dart';

void main() {
  const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
  const muxedAddress =
      'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG';

  group('extractRouting', () {
    test('decodes muxed routing when no external memo is present', () {
      final result = extractRouting(
        RoutingInput(destination: muxedAddress, memoType: 'none'),
      );

      expect(result.destinationBaseAccount, baseG);
      expect(result.id, BigInt.parse('9007199254740993'));
      expect(result.source, RoutingSource.muxed);
      expect(result.warnings, isEmpty);
      expect(result.destinationError, isNull);
    });

    test('prefers external memo over muxed routing and emits memo-ignored warning', () {
      final result = extractRouting(
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
      final result = extractRouting(
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
      final result = extractRouting(
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
        () => extractRouting(RoutingInput(destination: cAddress, memoType: 'none')),
        throwsA(isA<ExtractRoutingException>()),
      );
    });

    test('throws ExtractRoutingException for empty destination', () {
      expect(
        () => extractRouting(RoutingInput(destination: '', memoType: 'none')),
        throwsA(isA<ExtractRoutingException>()),
      );
    });
  });
  group('SEP-0029 memo requirement', () {
    test('appends MISSING_REQUIRED_MEMO when required memo is absent', () {
      final result = applyMemoRequirement(
        extractRouting(RoutingInput(destination: baseG, memoType: 'none')),
        const MemoRequirement(requiringMemo: true),
      );

      expect(result.warnings.last.code, codes.WarningCode.missingRequiredMemo);
      expect(result.warnings.last.severity, 'error');
    });

    test('does not append MISSING_REQUIRED_MEMO when routing id is present', () {
      final result = applyMemoRequirement(
        extractRouting(RoutingInput(destination: baseG, memoType: 'id', memoValue: '123')),
        const MemoRequirement(requiringMemo: true),
      );

      expect(
        result.warnings.map((warning) => warning.code),
        isNot(contains(codes.WarningCode.missingRequiredMemo)),
      );
    });
  });

}