import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
  const knownMAddress =
      'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672';

  group('DecodedMuxedAddress', () {
    test('exposes baseG and id after construction', () {
      final dto = DecodedMuxedAddress(baseG: baseG, id: BigInt.from(42));
      expect(dto.baseG, equals(baseG));
      expect(dto.id, equals(BigInt.from(42)));
    });

    test('== is true for two instances with same fields', () {
      final a = DecodedMuxedAddress(baseG: baseG, id: BigInt.zero);
      final b = DecodedMuxedAddress(baseG: baseG, id: BigInt.zero);
      expect(a, equals(b));
    });

    test('== is false when baseG differs', () {
      final a = DecodedMuxedAddress(baseG: baseG, id: BigInt.zero);
      final b = DecodedMuxedAddress(baseG: 'GDIFFERENT', id: BigInt.zero);
      expect(a, isNot(equals(b)));
    });

    test('== is false when id differs', () {
      final a = DecodedMuxedAddress(baseG: baseG, id: BigInt.zero);
      final b = DecodedMuxedAddress(baseG: baseG, id: BigInt.one);
      expect(a, isNot(equals(b)));
    });

    test('hashCode is equal for equal instances', () {
      final a = DecodedMuxedAddress(baseG: baseG, id: BigInt.from(7));
      final b = DecodedMuxedAddress(baseG: baseG, id: BigInt.from(7));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('toString contains baseG and id', () {
      final dto = DecodedMuxedAddress(baseG: baseG, id: BigInt.from(99));
      final s = dto.toString();
      expect(s, contains(baseG));
      expect(s, contains('99'));
    });
  });

  group('MuxedAddress.decode', () {
    test('decodes known M address to correct baseG and id', () {
      final result = MuxedAddress.decode(knownMAddress);
      expect(result.baseG, equals(baseG));
      expect(result.id, equals(BigInt.zero));
    });

    test('throws StellarAddressException for empty string', () {
      expect(
        () => MuxedAddress.decode(''),
        throwsA(isA<StellarAddressException>()),
      );
    });

    test('throws StellarAddressException for a G address', () {
      expect(
        () => MuxedAddress.decode(baseG),
        throwsA(isA<StellarAddressException>()),
      );
    });
  });
}
