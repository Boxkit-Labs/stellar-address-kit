import 'dart:convert';

import 'extract.dart';
import 'routing_result.dart';

/// Error codes for SEP-0007 URI parsing failures.
enum UriErrorCode {
  invalidUri('INVALID_URI'),
  unsupportedOperation('UNSUPPORTED_OPERATION'),
  missingDestination('MISSING_DESTINATION'),
  invalidEncoding('INVALID_ENCODING');

  final String code;
  const UriErrorCode(this.code);
}

class UriError {
  final UriErrorCode code;
  final String message;
  const UriError(this.code, this.message);

  @override
  String toString() => '${code.code}: $message';
}

/// Result of [extractRoutingFromURI]. [result] is null when [error] is set.
class UriRoutingResult {
  final RoutingResult? result;
  final UriError? error;
  final String? amount;
  final String? assetCode;
  final String? assetIssuer;

  const UriRoutingResult({
    this.result,
    this.error,
    this.amount,
    this.assetCode,
    this.assetIssuer,
  });
}

const _scheme = 'web+stellar:';

const _memoTypes = {
  'MEMO_TEXT': 'text',
  'MEMO_ID': 'id',
  'MEMO_HASH': 'hash',
  'MEMO_RETURN': 'return',
};

UriRoutingResult _fail(UriErrorCode code, String message) =>
    UriRoutingResult(error: UriError(code, message));

String? _base64ToHex(String value) {
  var s = value.replaceAll('-', '+').replaceAll('_', '/');
  s = s.replaceAll(RegExp(r'=+$'), '');
  if (!RegExp(r'^[A-Za-z0-9+/]*$').hasMatch(s) || s.length % 4 == 1) {
    return null;
  }
  s = s + '=' * ((4 - s.length % 4) % 4);
  try {
    final bytes = base64.decode(s);
    if (bytes.length != 32) return null;
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  } catch (_) {
    return null;
  }
}

/// Parses a SEP-0007 `web+stellar:pay` URI and delegates to [extractRoutingSync].
/// Never throws; failures are reported through [UriRoutingResult.error].
UriRoutingResult extractRoutingFromURI(String uri) {
  try {
    final trimmed = uri.trim();
    if (trimmed.isEmpty) {
      return _fail(UriErrorCode.invalidUri, 'URI must be a non-empty string.');
    }
    if (trimmed.length < _scheme.length ||
        trimmed.substring(0, _scheme.length).toLowerCase() != _scheme) {
      return _fail(UriErrorCode.invalidUri, 'URI must start with $_scheme');
    }

    var rest = trimmed.substring(_scheme.length);
    final hash = rest.indexOf('#');
    if (hash >= 0) rest = rest.substring(0, hash);
    final q = rest.indexOf('?');
    final operation = (q < 0 ? rest : rest.substring(0, q)).toLowerCase();
    final query = q < 0 ? '' : rest.substring(q + 1);

    if (operation == 'tx') {
      return _fail(
        UriErrorCode.unsupportedOperation,
        "Operation 'tx' is not supported.",
      );
    }
    if (operation != 'pay') {
      return _fail(
        UriErrorCode.invalidUri,
        "Unknown SEP-0007 operation '$operation'.",
      );
    }

    final params = <String, String>{};
    for (final pair in query.split('&')) {
      if (pair.isEmpty) continue;
      final eq = pair.indexOf('=');
      final rawKey = eq < 0 ? pair : pair.substring(0, eq);
      final rawVal = eq < 0 ? '' : pair.substring(eq + 1);
      try {
        params.putIfAbsent(
          Uri.decodeComponent(rawKey),
          () => Uri.decodeComponent(rawVal),
        );
      } catch (_) {
        return _fail(
          UriErrorCode.invalidEncoding,
          'Query contains invalid percent-encoding.',
        );
      }
    }

    final destination = params['destination']?.trim() ?? '';
    if (destination.isEmpty) {
      return _fail(
        UriErrorCode.missingDestination,
        "Missing 'destination' parameter.",
      );
    }

    var memoType = 'none';
    String? memoValue;
    final memo = params['memo'];
    if (memo != null && memo.isNotEmpty) {
      final sepType = (params['memo_type'] ?? 'MEMO_TEXT').toUpperCase();
      final mapped = _memoTypes[sepType];
      if (mapped == null) {
        return _fail(
          UriErrorCode.invalidUri,
          "Unsupported memo_type '$sepType'.",
        );
      }
      memoType = mapped;
      memoValue = memo;
      if (mapped == 'hash' || mapped == 'return') {
        final hex = _base64ToHex(memo);
        if (hex == null) {
          return _fail(
            UriErrorCode.invalidEncoding,
            'memo for $sepType must be base64-encoded 32 bytes.',
          );
        }
        memoValue = hex;
      }
    }

    final RoutingResult result;
    try {
      result = extractRoutingSync(
        RoutingInput(
          destination: destination,
          memoType: memoType,
          memoValue: memoValue,
        ),
      );
    } on ExtractRoutingException catch (e) {
      return _fail(UriErrorCode.invalidUri, e.message);
    }

    return UriRoutingResult(
      result: result,
      amount: params['amount'],
      assetCode: params['asset_code'],
      assetIssuer: params['asset_issuer'],
    );
  } catch (e) {
    return _fail(UriErrorCode.invalidUri, 'Invalid URI: $e');
  }
}
