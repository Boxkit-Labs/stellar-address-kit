import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('StellarAddress.parse', () {
    test('throws StellarAddressException for invalid strkey', () {
      // Invalid because checksum and/or length are incorrect.
      const invalidAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      expect(
        () => StellarAddress.parse(invalidAddress),
        throwsA(isA<StellarAddressException>()),
      );
    });

    test('throws StellarAddressException for unexpected characters', () {
      // Contains non-base32 characters like '!' and spaces which are invalid in strkey.
      const invalidAddress = 'GInvalid!@@@@@O000000000000000000000000000000000000';
      expect(
        () => StellarAddress.parse(invalidAddress),
        throwsA(isA<StellarAddressException>()),
      );
    });

    test('throws StellarAddressException for invalid muxed address form', () {
      // M prefix but wrong length/payload, should not silently produce range errors.
      const invalidMuxed = 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      expect(
        () => StellarAddress.parse(invalidMuxed),
        throwsA(isA<StellarAddressException>()),
      );
    });

    test('identifies kind as g for valid standard address', () {
      const validAddress =
          'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
      final result = StellarAddress.parse(validAddress);
      expect(result.kind, equals(AddressKind.g));
    });
  });
}
