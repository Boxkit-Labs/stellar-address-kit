import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

MockClient mock(int status, String body, {void Function(Uri)? onRequest}) =>
    MockClient((req) async {
      onRequest?.call(req.url);
      return http.Response(body, status);
    });

bool hasMissing(RoutingResult r) =>
    r.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO');

void main() {
  group('fetchMemoRequirement', () {
    test('true for config.memo_required', () async {
      Uri? seen;
      final c = mock(200, '{"data":{"config.memo_required":"MQ=="}}',
          onRequest: (u) => seen = u);
      expect(
          await fetchMemoRequirement(baseG,
              horizonUrl: 'https://horizon.test/', client: c),
          isTrue);
      expect(seen.toString(), 'https://horizon.test/accounts/$baseG');
    });

    test('true for config.requiring_memo', () async {
      final c = mock(200, '{"data":{"config.requiring_memo":"MQ=="}}');
      expect(await fetchMemoRequirement(baseG, client: c), isTrue);
    });

    test('false for other values, missing data, and 404', () async {
      expect(
          await fetchMemoRequirement(baseG,
              client: mock(200, '{"data":{"config.memo_required":"MA=="}}')),
          isFalse);
      expect(
          await fetchMemoRequirement(baseG, client: mock(200, '{"data":{}}')),
          isFalse);
      expect(await fetchMemoRequirement(baseG, client: mock(404, '{}')),
          isFalse);
    });

    test('throws on server error, bad json, empty id', () async {
      expect(fetchMemoRequirement(baseG, client: mock(500, '{}')),
          throwsA(isA<http.ClientException>()));
      expect(fetchMemoRequirement(baseG, client: mock(200, 'nope')),
          throwsA(isA<FormatException>()));
      expect(fetchMemoRequirement('', client: mock(200, '{}')),
          throwsArgumentError);
    });
  });

  group('extractRoutingAsync', () {
    final required = mock(200, '{"data":{"config.memo_required":"MQ=="}}');

    test('adds MISSING_REQUIRED_MEMO when memo absent', () async {
      final r = await extractRoutingAsync(
        RoutingInput(destination: baseG, memoType: 'none'),
        client: required,
      );
      expect(hasMissing(r), isTrue);
    });

    test('no warning when memo provided', () async {
      final r = await extractRoutingAsync(
        RoutingInput(destination: baseG, memoType: 'id', memoValue: '42'),
        client: required,
      );
      expect(hasMissing(r), isFalse);
    });

    test('fails open on lookup error', () async {
      final r = await extractRoutingAsync(
        RoutingInput(destination: baseG, memoType: 'none'),
        client: mock(500, '{}'),
      );
      expect(hasMissing(r), isFalse);
    });
  });
}
