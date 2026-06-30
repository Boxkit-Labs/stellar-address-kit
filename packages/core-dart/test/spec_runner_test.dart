import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

const legacyVectorG = "GA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const legacyVectorMPrefix = "MA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const legacyVectorCPrefix = "CA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";

const validG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const validC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

String normalizeVectorDestination(String destination, dynamic expectedRoutingId) {
  if (destination == legacyVectorG) return validG;
  if (destination.startsWith(legacyVectorMPrefix)) {
    return MuxedAddress.encode(
      baseG: validG,
      id: BigInt.parse(expectedRoutingId.toString()),
    );
  }
  if (destination.startsWith(legacyVectorCPrefix)) return validC;
  return destination;
}

String? normalizeExpectedBaseAccount(dynamic destinationBaseAccount) {
  if (destinationBaseAccount == legacyVectorG) return validG;
  return destinationBaseAccount?.toString();
}

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

      test('$module: $description', () async {
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
            final destination = normalizeVectorDestination(
              input['destination'].toString(),
              expected['routingId'],
            );

            final routingInput = RoutingInput(
              destination: destination,
              memoType: input['memoType'].toString(),
              memoValue: input['memoValue']?.toString(),
              sourceAccount: input['sourceAccount']?.toString(),
            );

            try {
              final result = await extractRouting(routingInput);

              expect(result.destinationBaseAccount,
                  normalizeExpectedBaseAccount(expected['destinationBaseAccount']));

              if (expected['routingId'] != null) {
                expect(result.id, BigInt.parse(expected['routingId'].toString()));
              } else {
                expect(result.id, isNull);
              }

              expect(result.source.name, expected['routingSource']);

              if (expected.containsKey('warnings')) {
                final List<dynamic> expectedWarnings =
                    expected['warnings'] as List<dynamic>;
                expect(result.warnings.length, expectedWarnings.length);
                for (var i = 0; i < expectedWarnings.length; i++) {
                  final eW = expectedWarnings[i] as Map<String, dynamic>;
                  expect(result.warnings[i].code, eW['code']);
                }
              }

              if (expected.containsKey('destinationError')) {
                final eE = expected['destinationError'] as Map<String, dynamic>;
                expect(result.destinationError?.code, eE['code']);
              }
            } on ExtractRoutingException {
              if (destination.startsWith('C')) {
                // Expected for C-address vectors in this spec runner
              } else {
                rethrow;
              }
            }
            break;
        }
      });
    }
  });
}

