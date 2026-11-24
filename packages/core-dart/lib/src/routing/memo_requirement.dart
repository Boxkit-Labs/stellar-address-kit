import 'dart:convert';

import 'package:http/http.dart' as http;

import 'extract.dart';
import 'routing_result.dart';

/// Default public Horizon endpoint.
const String defaultHorizonUrl = 'https://horizon.stellar.org';

/// SEP-0029 account data keys; either set to "1" marks a memo as required.
const List<String> memoRequiredKeys = [
  'config.memo_required',
  'config.requiring_memo',
];

/// Queries Horizon for the SEP-0029 memo requirement of [accountId].
///
/// Returns `false` when the account does not exist (HTTP 404). Throws on
/// network errors, non-200 responses, or malformed bodies. Pass a [client]
/// (e.g. `MockClient`) to control the HTTP layer.
Future<bool> fetchMemoRequirement(
  String accountId, {
  String horizonUrl = defaultHorizonUrl,
  http.Client? client,
}) async {
  if (accountId.isEmpty) {
    throw ArgumentError.value(accountId, 'accountId', 'must not be empty');
  }
  final base = horizonUrl.endsWith('/')
      ? horizonUrl.substring(0, horizonUrl.length - 1)
      : horizonUrl;
  final uri = Uri.parse('$base/accounts/${Uri.encodeComponent(accountId)}');
  final httpClient = client ?? http.Client();
  try {
    final response =
        await httpClient.get(uri, headers: {'Accept': 'application/json'});
    if (response.statusCode == 404) return false;
    if (response.statusCode != 200) {
      throw http.ClientException(
        'Horizon returned status ${response.statusCode}',
        uri,
      );
    }
    final body = jsonDecode(response.body);
    final data = body is Map ? body['data'] : null;
    if (data is! Map) return false;
    for (final key in memoRequiredKeys) {
      final value = data[key];
      if (value is String) {
        try {
          if (utf8.decode(base64.decode(value)) == '1') return true;
        } on FormatException {
          // Ignore undecodable entries.
        }
      }
    }
    return false;
  } finally {
    if (client == null) httpClient.close();
  }
}

/// Non-blocking routing extraction that queries Horizon and appends
/// `MISSING_REQUIRED_MEMO` when the destination requires a memo but none was
/// provided. Lookup failures fail open.
Future<RoutingResult> extractRoutingAsync(
  RoutingInput input, {
  String horizonUrl = defaultHorizonUrl,
  http.Client? client,
}) {
  return extractRouting(
    input,
    fetchMemoRequirement: (account) => fetchMemoRequirement(
      account,
      horizonUrl: horizonUrl,
      client: client,
    ),
  );
}
