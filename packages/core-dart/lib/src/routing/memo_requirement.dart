import 'dart:convert';

import 'package:http/http.dart' as http;

import '../address/codes.dart' as codes;
import '../address/detect.dart';
import '../address/parse.dart';
import 'extract.dart';
import 'routing_result.dart';

/// The default Horizon endpoint used for SEP-0029 memo requirement lookups.
const String defaultHorizonUrl = 'https://horizon.stellar.org';

/// Signature of the asynchronous hook used by [extractRoutingAsync].
///
/// Receives the destination's base G account and reports whether that
/// account requires a memo under SEP-0029.
typedef MemoRequirementFetcher = Future<bool> Function(String baseAccount);

/// Fetches the SEP-0029 memo requirement for [accountID] from Horizon.
///
/// Issues `GET {horizonUrl}/accounts/{accountID}` and decodes the Horizon
/// data entries `config.memo_required` and `config.requiring_memo`
/// (Horizon stores them base64-encoded, e.g. `"MQ=="` for `"1"`). Both keys
/// are accepted; either decoding to `"1"` means a memo is required.
///
/// Behaviour mirrors the TypeScript `fetchMemoRequirement`:
/// * a non-2xx response (including 404 for unfunded accounts) reports
///   `false` without parsing the body;
/// * network failures and malformed or JSON-`null` bodies throw (callers
///   using [extractRoutingAsync] fail open on these);
/// * [accountID] is validated as a classic G address before any request is
///   made and throws a [FormatException] otherwise.
///
/// [client] and [horizonUrl] are injectable so tests can use a mock client
/// and alternative Horizon deployments (e.g. testnet). When [client] is
/// omitted a short-lived client is created and closed for the call.
Future<bool> fetchMemoRequirement(
  String accountID, {
  http.Client? client,
  String horizonUrl = defaultHorizonUrl,
}) async {
  if (detect(accountID) != codes.AddressKind.g) {
    throw FormatException(
      'fetchMemoRequirement: "$accountID" is not a valid Stellar account '
      '(G...) address.',
    );
  }

  final lookupClient = client ?? http.Client();
  try {
    final response = await lookupClient.get(
      _horizonAccountUri(horizonUrl, accountID),
    );

    // Any non-2xx response (404 unfunded, rate limits, server errors)
    // reports "no memo requirement", matching the TypeScript
    // `!response.ok` short-circuit.
    if (response.statusCode < 200 || response.statusCode > 299) {
      return false;
    }

    Object? account;
    try {
      account = jsonDecode(response.body);
    } on FormatException catch (err) {
      throw FormatException(
        'fetchMemoRequirement: malformed Horizon response: ${err.message}',
      );
    }

    if (account == null) {
      // The TypeScript reference dereferences the parsed value, so a JSON
      // `null` body raises there; mirror that as an error.
      throw const FormatException(
        'fetchMemoRequirement: Horizon account response was JSON null',
      );
    }
    if (account is! Map<String, dynamic>) {
      // Non-object JSON yields undefined (and therefore false) in
      // TypeScript.
      return false;
    }

    final data = account['data'];
    if (data is! Map<String, dynamic>) {
      return false;
    }

    return _decodeMemoRequirementValue(data['config.memo_required']) ||
        _decodeMemoRequirementValue(data['config.requiring_memo']);
  } finally {
    if (client == null) {
      lookupClient.close();
    }
  }
}

/// Performs synchronous [extractRouting] and, when the destination is a
/// classic account that resolved no routing ID, additionally checks the
/// destination's SEP-0029 memo requirement.
///
/// Semantics mirror the TypeScript `extractRoutingAsync`:
/// * no lookup happens when there is no base account, a routing ID is
///   already present (muxed address or memo), or the destination failed to
///   parse;
/// * a destination that requires a memo but supplied none gets a
///   [RoutingWarning.missingRequiredMemo] error warning appended after all
///   existing warnings;
/// * fetch failures (network errors, malformed responses) fail open and
///   leave the synchronous result untouched.
///
/// [requirementFetcher] replaces the default Horizon-backed check; pass a
/// custom closure to inject a mock client or a different Horizon URL:
///
/// ```dart
/// final result = await extractRoutingAsync(
///   RoutingInput(destination: account, memoType: 'none'),
///   requirementFetcher: (id) => fetchMemoRequirement(id, client: mockClient),
/// );
/// ```
Future<RoutingResult> extractRoutingAsync(
  RoutingInput input, {
  MemoRequirementFetcher? requirementFetcher,
}) async {
  // May throw ExtractRoutingException for invalid destinations, exactly as
  // the synchronous extractRouting does (the TypeScript reference also
  // propagates those errors from its async wrapper).
  final result = extractRouting(input);

  if (result.destinationBaseAccount == null ||
      result.id != null ||
      result.destinationError != null) {
    return result;
  }

  // The TypeScript reference always yields a routing ID for muxed
  // destinations, so they never trigger a lookup there; keep that behaviour
  // even when the synchronous result lost the muxed ID to an unroutable
  // external memo.
  if (_isMuxedDestination(input.destination)) {
    return result;
  }

  try {
    final fetcher = requirementFetcher ?? fetchMemoRequirement;
    final required = await fetcher(result.destinationBaseAccount!);
    if (required) {
      return RoutingResult(
        source: result.source,
        id: result.id,
        destinationBaseAccount: result.destinationBaseAccount,
        destinationError: result.destinationError,
        warnings: [...result.warnings, RoutingWarning.missingRequiredMemo],
      );
    }
  } catch (_) {
    // Network/configuration failures must not change the synchronous result.
  }
  return result;
}

/// Builds `{horizonUrl}/accounts/{accountID}` from parsed URI parts so no
/// string concatenation of the request URL can inject extra path segments.
Uri _horizonAccountUri(String horizonUrl, String accountID) {
  // The TypeScript reference strips a single trailing slash before
  // appending the path.
  final base = horizonUrl.endsWith('/')
      ? horizonUrl.substring(0, horizonUrl.length - 1)
      : horizonUrl;
  final baseUri = Uri.parse(base);
  return baseUri.replace(
    pathSegments: [
      for (final segment in baseUri.pathSegments)
        if (segment.isNotEmpty) segment,
      'accounts',
      accountID,
    ],
  );
}

/// Returns true when [destination] parses as a muxed (M...) address.
bool _isMuxedDestination(String destination) {
  try {
    return parse(destination).kind == codes.AddressKind.m;
  } catch (_) {
    return false;
  }
}

/// Mirrors the TypeScript `decodeDataValue` helper: the literal values
/// `"1"`, `1`, and `true` count as required, and any other string is
/// base64-decoded (as Horizon stores data entries) and compared against
/// `"1"`.
bool _decodeMemoRequirementValue(Object? value) {
  if (value == true) {
    return true;
  }
  if (value is bool) {
    return false;
  }
  if (value is num) {
    return value == 1;
  }
  if (value is! String) {
    return false;
  }
  if (value == '1') {
    return true;
  }
  return _decodeBase64Forgiving(value);
}

/// Decodes base64 the way JavaScript's `atob` (the WHATWG forgiving base64
/// algorithm) does: ASCII whitespace is ignored, padding is optional, and a
/// leftover chunk of length `%4 == 1` is invalid.
bool _decodeBase64Forgiving(String input) {
  final compact = input
      .replaceAll(RegExp(r'[ \t\n\f\r]'), '')
      .replaceAll(RegExp(r'=+$'), '');
  if (compact.length % 4 == 1) {
    return false;
  }
  const padding = {0: '', 1: '===', 2: '==', 3: '='};
  final padded = compact + padding[compact.length % 4]!;
  try {
    final bytes = base64.decode(padded);
    return String.fromCharCodes(bytes) == '1';
  } on FormatException {
    return false;
  }
}
