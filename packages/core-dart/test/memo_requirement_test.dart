import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
const muxedAddress =
    'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG';
const cAddress = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const missingMemoMessage =
    'Destination account requires a memo, but no routing ID was provided.';

/// Builds a Horizon-style account payload from data entries that are already
/// base64-encoded, mirroring Horizon's /accounts response.
String memoReqResponse(Map<String, dynamic> data) => jsonEncode({'data': data});

void main() {
  group('fetchMemoRequirement', () {
    test('returns true when config.memo_required is base64 "MQ=="', () async {
      var calls = 0;
      final client = MockClient((request) async {
        calls++;
        expect(request.method, 'GET');
        expect(request.url.path, '/accounts/$baseG');
        return http.Response(
          memoReqResponse({'config.memo_required': 'MQ=='}),
          200,
        );
      });

      final required = await fetchMemoRequirement(baseG, client: client);

      expect(required, isTrue);
      expect(calls, 1);
    });

    test('accepts literal "1", 1, and true values like the TS decodeDataValue',
        () async {
      const cases = <String, Object?>{
        'string_one': '1',
        'json_number_one': 1,
        'json_true': true,
        'json_false': false,
        'json_number_zero': 0,
        'base64_zero': 'MA==',
        'invalid_base64': '!!not-base64!!',
        'base64_of_other_text': 'aGVsbG8=',
      };

      for (final entry in cases.entries) {
        final client = MockClient((request) async => http.Response(
              jsonEncode({
                'data': {'config.memo_required': entry.value},
              }),
              200,
            ));

        final required = await fetchMemoRequirement(baseG, client: client);

        final wantTrue =
            entry.value == '1' || entry.value == 1 || entry.value == true;
        expect(required, wantTrue, reason: 'case ${entry.key}');
      }
    });

    test('falls back to config.requiring_memo', () async {
      const cases = <String, ({Map<String, dynamic> data, bool want})>{
        'requiring_memo_only': (
          data: {'config.requiring_memo': 'MQ=='},
          want: true,
        ),
        'memo_required_false_requiring_memo_true': (
          data: {
            'config.memo_required': 'MA==',
            'config.requiring_memo': 'MQ=='
          },
          want: true,
        ),
        'both_false': (
          data: {
            'config.memo_required': 'MA==',
            'config.requiring_memo': 'MA=='
          },
          want: false,
        ),
      };

      for (final entry in cases.entries) {
        final client = MockClient((request) async =>
            http.Response(jsonEncode({'data': entry.value.data}), 200));

        final required = await fetchMemoRequirement(baseG, client: client);

        expect(required, entry.value.want, reason: 'case ${entry.key}');
      }
    });

    test('returns false when the flag or data entry is absent', () async {
      const bodies = <String, String>{
        'empty_data_object': '{"data":{}}',
        'no_data_key': '{"id":"G..."}',
        'data_is_null': '{"data":null}',
        'data_is_not_an_object': '{"data":"nope"}',
      };

      for (final entry in bodies.entries) {
        final client =
            MockClient((request) async => http.Response(entry.value, 200));

        final required = await fetchMemoRequirement(baseG, client: client);

        expect(required, isFalse, reason: 'case ${entry.key}');
      }
    });

    test('returns false for unfunded (404) accounts', () async {
      final client = MockClient((request) async =>
          http.Response('{"title":"Not Found","status":404}', 404));

      final required = await fetchMemoRequirement(baseG, client: client);

      expect(required, isFalse);
    });

    test('returns false for other non-2xx responses', () async {
      final client = MockClient((request) async => http.Response('boom', 500));

      final required = await fetchMemoRequirement(baseG, client: client);

      expect(required, isFalse);
    });

    test('throws FormatException on malformed JSON', () async {
      final client =
          MockClient((request) async => http.Response('{"data":', 200));

      await expectLater(
        fetchMemoRequirement(baseG, client: client),
        throwsA(isA<FormatException>()),
      );
    });

    test('throws FormatException on a JSON null body', () async {
      final client = MockClient((request) async => http.Response('null', 200));

      await expectLater(
        fetchMemoRequirement(baseG, client: client),
        throwsA(isA<FormatException>()),
      );
    });

    test('throws FormatException on an empty body', () async {
      final client = MockClient((request) async => http.Response('', 200));

      await expectLater(
        fetchMemoRequirement(baseG, client: client),
        throwsA(isA<FormatException>()),
      );
    });

    test('propagates network errors from the client', () async {
      final client = MockClient(
          (request) => throw http.ClientException('connection refused'));

      await expectLater(
        fetchMemoRequirement(baseG, client: client),
        throwsA(isA<http.ClientException>()),
      );
    });

    test('rejects an invalid account ID before any request', () async {
      // Flip the final checksum character so the strkey checksum fails.
      final corruptG = '${baseG.substring(0, baseG.length - 1)}X';
      final invalidIds = <String>[
        '',
        'not-an-address',
        muxedAddress,
        cAddress,
        corruptG, // corrupted checksum
        '../admin',
      ];

      for (final accountID in invalidIds) {
        var calls = 0;
        final client = MockClient((request) async {
          calls++;
          return http.Response('{}', 200);
        });

        await expectLater(
          fetchMemoRequirement(accountID, client: client),
          throwsA(isA<FormatException>()),
          reason: 'account "$accountID"',
        );
        expect(calls, 0,
            reason: 'validation must precede the network call '
                'for "$accountID"');
      }
    });

    test('uses the account path under the injected base URL', () async {
      final paths = <String>[];
      final client = MockClient((request) async {
        paths.add(request.url.path);
        return http.Response('{"data":{}}', 200);
      });

      await fetchMemoRequirement(baseG,
          client: client, horizonUrl: 'https://horizon.example');
      await fetchMemoRequirement(baseG,
          client: client, horizonUrl: 'https://horizon.example/');
      await fetchMemoRequirement(baseG,
          client: client, horizonUrl: 'https://horizon.example/api');

      expect(paths, [
        '/accounts/$baseG',
        '/accounts/$baseG',
        '/api/accounts/$baseG',
      ]);
    });
  });

  group('extractRoutingAsync', () {
    test('appends MISSING_REQUIRED_MEMO when a memo is required but missing',
        () async {
      final client = MockClient((request) async => http.Response(
            memoReqResponse({'config.memo_required': 'MQ=='}),
            200,
          ));

      final result = await extractRoutingAsync(
        RoutingInput(destination: baseG, memoType: 'none'),
        requirementFetcher: (id) => fetchMemoRequirement(id, client: client),
      );

      expect(result.warnings, isNotEmpty);
      final warning = result.warnings.last;
      expect(warning.code, 'MISSING_REQUIRED_MEMO');
      expect(warning.severity, 'error');
      expect(warning.message, missingMemoMessage);
      expect(result.destinationBaseAccount, baseG);
      expect(result.id, isNull);
      // Appended after all existing warnings.
      expect(
        result.warnings.where((w) => w.code == 'MISSING_REQUIRED_MEMO').length,
        1,
      );
    });

    test(
        'appends MISSING_REQUIRED_MEMO for an empty text memo and keeps '
        'existing warnings', () async {
      final client = MockClient((request) async => http.Response(
            memoReqResponse({'config.memo_required': 'MQ=='}),
            200,
          ));

      final result = await extractRoutingAsync(
        RoutingInput(destination: baseG, memoType: 'text', memoValue: ''),
        requirementFetcher: (id) => fetchMemoRequirement(id, client: client),
      );

      final codes = result.warnings.map((w) => w.code).toList(growable: false);
      expect(codes.length, greaterThanOrEqualTo(2));
      expect(codes.last, 'MISSING_REQUIRED_MEMO');
      expect(codes.first, isNot('MISSING_REQUIRED_MEMO'));
      expect(result.id, isNull);
    });

    test('does not look up when a routing ID is already present', () async {
      var calls = 0;
      Future<bool> fetcher(String id) async {
        calls++;
        return true;
      }

      final result = await extractRoutingAsync(
        RoutingInput(destination: baseG, memoType: 'id', memoValue: '100'),
        requirementFetcher: fetcher,
      );

      expect(calls, 0);
      expect(result.id, BigInt.from(100));
      expect(
        result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO'),
        isFalse,
      );
    });

    test('does not look up for muxed destinations', () async {
      final inputs = <RoutingInput>[
        RoutingInput(destination: muxedAddress, memoType: 'none'),
        RoutingInput(
            destination: muxedAddress,
            memoType: 'text',
            memoValue: 'not-a-routing-id'),
        RoutingInput(
            destination: muxedAddress, memoType: 'id', memoValue: 'abc'),
      ];

      for (final input in inputs) {
        var calls = 0;
        Future<bool> fetcher(String id) async {
          calls++;
          return true;
        }

        final result = await extractRoutingAsync(
          input,
          requirementFetcher: fetcher,
        );

        expect(calls, 0,
            reason: 'muxed destinations must never trigger a lookup '
                'for memoType ${input.memoType}');
        expect(
          result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO'),
          isFalse,
        );
      }
    });

    test(
        'propagates ExtractRoutingException for contract destinations '
        'without a lookup', () async {
      var calls = 0;
      Future<bool> fetcher(String id) async {
        calls++;
        return true;
      }

      await expectLater(
        extractRoutingAsync(
          RoutingInput(destination: cAddress, memoType: 'none'),
          requirementFetcher: fetcher,
        ),
        throwsA(isA<ExtractRoutingException>()),
      );
      expect(calls, 0);
    });

    test('does not look up for an unparseable destination', () async {
      var calls = 0;
      Future<bool> fetcher(String id) async {
        calls++;
        return true;
      }

      // G-prefixed but corrupt checksum: extractRouting returns a
      // destinationError instead of throwing, so the wrapper must skip the
      // lookup.
      final corruptG = '${baseG.substring(0, baseG.length - 1)}X';
      final result = await extractRoutingAsync(
        RoutingInput(destination: corruptG, memoType: 'none'),
        requirementFetcher: fetcher,
      );

      expect(calls, 0);
      expect(result.destinationError, isNotNull);
      expect(
        result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO'),
        isFalse,
      );
    });

    test('leaves the result unchanged when no memo is required', () async {
      final client = MockClient((request) async => http.Response(
            memoReqResponse({'config.memo_required': 'MA=='}),
            200,
          ));
      final input = RoutingInput(destination: baseG, memoType: 'none');

      final result = await extractRoutingAsync(
        input,
        requirementFetcher: (id) => fetchMemoRequirement(id, client: client),
      );

      expect(result, extractRouting(input));
      expect(
        result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO'),
        isFalse,
      );
    });

    test('fails open when the requirement fetch throws', () async {
      final input = RoutingInput(destination: baseG, memoType: 'none');

      final result = await extractRoutingAsync(
        input,
        requirementFetcher: (id) =>
            throw http.ClientException('connection refused'),
      );

      expect(result, extractRouting(input));
      expect(
        result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO'),
        isFalse,
      );
    });

    test('fails open when the Horizon response is malformed', () async {
      final client =
          MockClient((request) async => http.Response('not json', 200));
      final input = RoutingInput(destination: baseG, memoType: 'none');

      final result = await extractRoutingAsync(
        input,
        requirementFetcher: (id) => fetchMemoRequirement(id, client: client),
      );

      expect(result, extractRouting(input));
      expect(
        result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO'),
        isFalse,
      );
    });
  });
}
