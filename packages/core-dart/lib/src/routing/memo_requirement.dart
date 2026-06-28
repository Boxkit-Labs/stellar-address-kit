import 'dart:convert';
import 'dart:io';

import '../address/codes.dart' as codes;
import 'extract.dart';
import 'routing_result.dart';

/// SEP-0029 memo requirement configuration for a destination account.
final class MemoRequirement {
  /// Whether the account requires a memo/routing ID for inbound payments.
  final bool requiringMemo;

  const MemoRequirement({required this.requiringMemo});
}

typedef MemoRequirementFetcher = Future<MemoRequirement?> Function(String baseAccount);

bool _parseMemoRequirementValue(Object? value) {
  if (value is bool) return value;
  if (value is! String) return false;

  var decoded = value.trim();
  try {
    decoded = utf8.decode(base64.decode(value)).trim();
  } catch (_) {}

  if (decoded == 'true' || decoded == '1') return true;
  if (decoded == 'false' || decoded == '0' || decoded.isEmpty) return false;

  try {
    final jsonValue = jsonDecode(decoded);
    return jsonValue == true ||
        (jsonValue is Map && jsonValue['requiring_memo'] == true);
  } catch (_) {
    return false;
  }
}

/// Fetches SEP-0029 memo requirement configuration from a Horizon account.
Future<MemoRequirement> fetchMemoRequirement(
  String baseAccount, {
  String horizonUrl = 'https://horizon.stellar.org',
  HttpClient? client,
}) async {
  final uri = Uri.parse('${horizonUrl.replaceFirst(RegExp(r'/$'), '')}/accounts/$baseAccount');
  final httpClient = client ?? HttpClient();
  final request = await httpClient.getUrl(uri);
  final response = await request.close();

  if (response.statusCode < 200 || response.statusCode > 299) {
    throw Exception('Unable to fetch SEP-0029 memo requirement: ${response.statusCode}');
  }

  final body = await utf8.decoder.bind(response).join();
  final account = jsonDecode(body) as Map<String, dynamic>;
  final attrs = (account['data_attr'] as Map?) ?? const {};
  final value = attrs['config.requiring_memo'] ?? attrs['config.memo_required'];
  return MemoRequirement(requiringMemo: _parseMemoRequirementValue(value));
}

/// Appends MISSING_REQUIRED_MEMO when SEP-0029 says a memo is required but absent.
RoutingResult applyMemoRequirement(
  RoutingResult result,
  MemoRequirement? requirement,
) {
  if (requirement?.requiringMemo != true || result.id != null) return result;

  return RoutingResult(
    source: result.source,
    id: result.id,
    destinationBaseAccount: result.destinationBaseAccount,
    destinationError: result.destinationError,
    warnings: [
      ...result.warnings,
      const RoutingWarning(
        code: codes.WarningCode.missingRequiredMemo,
        severity: 'error',
        message: 'Destination account requires a memo/routing ID under SEP-0029, but none was provided.',
      ),
    ],
  );
}

/// Extracts routing information and checks an optional SEP-0029 memo requirement fetcher.
Future<RoutingResult> extractRoutingWithMemoRequirement(
  RoutingInput input, {
  MemoRequirementFetcher fetcher = fetchMemoRequirement,
}) async {
  final result = extractRouting(input);
  final baseAccount = result.destinationBaseAccount;
  if (baseAccount == null) return result;

  final requirement = await fetcher(baseAccount);
  return applyMemoRequirement(result, requirement);
}
