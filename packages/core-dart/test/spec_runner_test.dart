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
            final routingInput = RoutingInput(
              destination: input['destination'].toString(),
              memoType: input['memoType']?.toString() ?? 'none',
              memoValue: input['memoValue']?.toString(),
            );

            final result = extractRouting(routingInput);

            // Validate routingSource
            final expectedSource = expected['routingSource']?.toString();
            if (expectedSource != null) {
              expect(
                result.routingSource.name,
                expectedSource,
                reason: 'routingSource mismatch',
              );
            }

            // Validate routingId
            final expectedId = expected['routingId'];
            if (expectedId == null) {
              expect(result.routingId, isNull, reason: 'routingId should be null');
            } else {
              expect(
                result.routingId,
                expectedId.toString(),
                reason: 'routingId mismatch',
              );
            }

            // Validate destinationBaseAccount
            final expectedBase = expected['destinationBaseAccount'];
            if (expectedBase == null) {
              expect(result.destinationBaseAccount, isNull,
                  reason: 'destinationBaseAccount should be null');
            } else {
              expect(
                result.destinationBaseAccount,
                expectedBase.toString(),
                reason: 'destinationBaseAccount mismatch',
              );
            }

            // Validate warnings (codes only)
            final expectedWarnings =
                (expected['warnings'] as List<dynamic>? ?? []);
            expect(
              result.warnings.length,
              expectedWarnings.length,
              reason: 'warnings count mismatch',
            );
            for (var i = 0; i < expectedWarnings.length; i++) {
              final w = expectedWarnings[i] as Map<String, dynamic>;
              expect(result.warnings[i].code, w['code'],
                  reason: 'warning[$i].code mismatch');
              expect(result.warnings[i].severity, w['severity'],
                  reason: 'warning[$i].severity mismatch');
            }
            break;
        }
      });
    }
  });
}
