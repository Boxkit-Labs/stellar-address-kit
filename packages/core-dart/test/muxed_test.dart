import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('MuxedAddress.encode', () {
    // Shared base G address used across encoding tests
    const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

    test('encodes id=0 (minimum uint64 boundary)', () {
      const expected =
          'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672';

      final result = MuxedAddress.encode(baseG: baseG, id: BigInt.zero);

      expect(result, equals(expected));
    });

    test('encodes id above 2^53 (9007199254740993) without truncation', () {
      // ID = 2^53 + 1 = 9007199254740993, which exceeds JavaScript's
      // safe integer limit (2^53 - 1). BigInt must be used to avoid
      // floating-point precision loss when encoding to uint64.
      const expected =
          'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG';

      final result = MuxedAddress.encode(
        baseG: baseG,
        id: BigInt.parse('9007199254740993'),
      );

      expect(result, equals(expected));
    });
  });
}
