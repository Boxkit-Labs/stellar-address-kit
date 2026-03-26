import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  final file = File('../../spec/vectors.json');

  if (!file.existsSync()) {
    fail('Expected spec/vectors.json but file was not found.');
  }

  final Map<String, dynamic> json =
      jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;

  final List<dynamic> cases = json['cases'] as List<dynamic>;

  group('Spec Runner', () {
    for (final dynamic c in cases) {
      final Map<String, dynamic> caseData = c as Map<String, dynamic>;
      final String description =
          caseData['description']?.toString() ?? 'Unnamed';
      final String module = caseData['module']?.toString() ?? '';

      test('$module: $description', () {
        final input = caseData['input'] as Map<String, dynamic>;
        final expected = caseData['expected'] as Map<String, dynamic>;

        switch (module) {
          case 'muxed_encode':
            final String baseG = input['base_g'].toString();
            final BigInt id = BigInt.parse(input['id'].toString());
            final String result = MuxedAddress.encode(baseG: baseG, id: id);
            expect(result, expected['mAddress']);
            break;

          case 'muxed_decode':
            if (expected.containsKey('expected_error')) {
              expect(() => StellarAddress.parse(input['mAddress'].toString()),
                  throwsA(isA<StellarAddressException>()));
            } else {
              final address =
                  StellarAddress.parse(input['mAddress'].toString());
              expect(address.kind, AddressKind.m);
              expect(address.baseG, expected['base_g']);
              expect(address.muxedId, BigInt.parse(expected['id'].toString()));
            }
            break;

          case 'detect':
            final kind = detect(input['address'].toString());
            if (expected.containsKey('kind')) {
              expect(kind?.toString().split('.').last.toUpperCase(),
                  expected['kind']);
            } else {
              expect(kind, isNull);
            }
            break;

          case 'extract_routing':
            // These vectors currently use placeholder addresses that are not
            // valid StrKey inputs, so routing behavior is covered in the
            // dedicated extract_routing_test.dart unit tests instead.
            break;
        }
      });
    }
  });
}
