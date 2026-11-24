import 'extract.dart';
import 'routing_result.dart';

/// A routing result paired with the index of the operation it was derived from.
final class OperationRoutingResult {
  /// Zero-based index of the operation within `tx.operations`.
  final int operationIndex;

  /// The deposit routing extraction result for this operation.
  final RoutingResult result;

  const OperationRoutingResult({
    required this.operationIndex,
    required this.result,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is OperationRoutingResult &&
          runtimeType == other.runtimeType &&
          operationIndex == other.operationIndex &&
          result == other.result;

  @override
  int get hashCode => Object.hash(operationIndex, result);

  @override
  String toString() =>
      'OperationRoutingResult(operationIndex: $operationIndex, result: $result)';
}

/// Extracts deposit routing information from a Stellar transaction.
///
/// Compatible with `stellar_flutter_sdk.Transaction`, `FeeBumpTransaction`,
/// and Horizon transaction payload maps.
///
/// By default, inspects the first operation ([operationIndex] = 0). If
/// [operationIndex] is explicitly provided, routes that specific operation index.
///
/// Returns `null` if:
/// - [tx] is `null`,
/// - the operations list is empty,
/// - [operationIndex] is negative or >= operations.length,
/// - the targeted operation is not payment-like (e.g. `CreateAccountOperation`,
///   `AccountMergeOperation`, `ChangeTrustOperation`).
///
/// When an operation is payment-like, [extractRoutingSync] is invoked so any
/// destination address errors or unroutable memos are reported in the returned
/// [RoutingResult] with full warning and error parity.
RoutingResult? extractRoutingFromTx(dynamic tx, {int? operationIndex}) {
  if (tx == null) return null;

  final unwrappedTx = _unwrapTransaction(tx);
  final ops = _extractOperations(unwrappedTx);
  if (ops == null || ops.isEmpty) return null;

  final targetIdx = operationIndex ?? 0;
  if (targetIdx < 0 || targetIdx >= ops.length) return null;

  final op = ops[targetIdx];
  if (!_isPaymentLike(op)) return null;

  final destination = _extractDestination(op);
  if (destination == null || destination.isEmpty) return null;

  final (memoType, memoValue) = _extractMemo(unwrappedTx);
  final opSource = _extractOpSource(op);
  final txSource = _extractTxSource(unwrappedTx);

  // op.source ?? tx.source precedence
  final sourceAccount = (opSource != null && opSource.isNotEmpty)
      ? opSource
      : txSource;

  return extractRoutingSync(RoutingInput(
    destination: destination,
    memoType: memoType,
    memoValue: memoValue,
    sourceAccount: sourceAccount,
  ));
}

/// Extracts routing information from every payment-like operation in [tx],
/// tagged with its respective operation index in `tx.operations`.
List<OperationRoutingResult> extractAllRoutingFromTx(dynamic tx) {
  if (tx == null) return const [];

  final unwrappedTx = _unwrapTransaction(tx);
  final ops = _extractOperations(unwrappedTx);
  if (ops == null || ops.isEmpty) return const [];

  final (memoType, memoValue) = _extractMemo(unwrappedTx);
  final txSource = _extractTxSource(unwrappedTx);
  final results = <OperationRoutingResult>[];

  for (var i = 0; i < ops.length; i++) {
    final op = ops[i];
    if (!_isPaymentLike(op)) continue;

    final destination = _extractDestination(op);
    if (destination == null || destination.isEmpty) continue;

    final opSource = _extractOpSource(op);
    final sourceAccount = (opSource != null && opSource.isNotEmpty)
        ? opSource
        : txSource;

    final res = extractRoutingSync(RoutingInput(
      destination: destination,
      memoType: memoType,
      memoValue: memoValue,
      sourceAccount: sourceAccount,
    ));

    results.add(OperationRoutingResult(
      operationIndex: i,
      result: res,
    ));
  }

  return results;
}

dynamic _unwrapTransaction(dynamic tx) {
  if (tx == null) return null;
  // If FeeBumpTransaction, unwrap innerTransaction
  try {
    final inner = tx.innerTransaction;
    if (inner != null) return inner;
  } catch (_) {}
  try {
    if (tx is Map) {
      final inner = tx['inner_transaction'] ?? tx['innerTransaction'];
      if (inner != null) return inner;
    }
  } catch (_) {}
  return tx;
}

List<dynamic>? _extractOperations(dynamic tx) {
  if (tx == null) return null;
  try {
    final ops = tx.operations;
    if (ops is List) return ops;
  } catch (_) {}
  if (tx is Map) {
    final ops = tx['operations'];
    if (ops is List) return ops;
  }
  return null;
}

bool _isPaymentLike(dynamic op) {
  if (op == null) return false;

  final typeName = op.runtimeType.toString();
  if (typeName.contains('CreateAccount') ||
      typeName.contains('AccountMerge') ||
      typeName.contains('ChangeTrust') ||
      typeName.contains('ManageData')) {
    return false;
  }
  if (typeName.contains('PaymentOperation') ||
      typeName.contains('PathPaymentStrictReceiveOperation') ||
      typeName.contains('PathPaymentStrictSendOperation')) {
    return true;
  }

  if (op is Map) {
    final rawType = op['type']?.toString().toLowerCase().replaceAll('_', '').replaceAll('-', '');
    if (rawType == 'payment' ||
        rawType == 'pathpaymentstrictreceive' ||
        rawType == 'pathpaymentstrictsend') {
      return true;
    }
    if (rawType == 'createaccount' || rawType == 'accountmerge') {
      return false;
    }

    // Structural checks for map payloads
    final hasDest = op.containsKey('destination') || op.containsKey('to');
    final hasAsset = op.containsKey('asset') ||
        op.containsKey('destAsset') ||
        op.containsKey('dest_asset') ||
        op.containsKey('sendAsset') ||
        op.containsKey('send_asset');
    final hasStartingBalance = op.containsKey('startingBalance') ||
        op.containsKey('starting_balance');
    return hasDest && hasAsset && !hasStartingBalance;
  }

  // Structural checks for custom SDK-like objects
  try {
    final hasDest = _safeExtract(op, 'destination') != null ||
        _safeExtract(op, 'to') != null;
    final hasAsset = _safeExtract(op, 'asset') != null ||
        _safeExtract(op, 'destAsset') != null ||
        _safeExtract(op, 'sendAsset') != null;
    final hasStartingBalance = _safeExtract(op, 'startingBalance') != null ||
        _safeExtract(op, 'starting_balance') != null;
    return hasDest && hasAsset && !hasStartingBalance;
  } catch (_) {
    return false;
  }
}

dynamic _safeExtract(dynamic obj, String property) {
  try {
    if (obj is Map) return obj[property];
    switch (property) {
      case 'destination':
        return obj.destination;
      case 'to':
        return obj.to;
      case 'asset':
        return obj.asset;
      case 'destAsset':
        return obj.destAsset;
      case 'sendAsset':
        return obj.sendAsset;
      case 'startingBalance':
        return obj.startingBalance;
      case 'starting_balance':
        return obj.starting_balance;
    }
  } catch (_) {}
  return null;
}

String? _extractDestination(dynamic op) {
  dynamic rawDest;
  try {
    if (op is Map) {
      rawDest = op['destination'] ?? op['to'];
    } else {
      try {
        rawDest = op.destination;
      } catch (_) {
        rawDest = op.to;
      }
    }
  } catch (_) {
    return null;
  }

  if (rawDest == null) return null;
  if (rawDest is String) return rawDest;

  // For MuxedAccount in stellar_flutter_sdk:
  // Must extract .accountId (preserving M... addresses), never .ed25519AccountId.
  try {
    final accountId = rawDest.accountId;
    if (accountId is String && accountId.isNotEmpty) {
      return accountId;
    }
  } catch (_) {}

  try {
    final address = rawDest.address;
    if (address is String && address.isNotEmpty) {
      return address;
    }
  } catch (_) {}

  return rawDest.toString();
}

(String, String?) _extractMemo(dynamic tx) {
  if (tx is Map) {
    final memoTypeStr = tx['memo_type']?.toString() ??
        tx['memoType']?.toString() ??
        'none';
    final memoValStr = tx['memo']?.toString() ?? tx['memoValue']?.toString();
    return (memoTypeStr.toLowerCase(), memoValStr);
  }

  dynamic rawMemo;
  try {
    rawMemo = tx.memo;
  } catch (_) {
    return ('none', null);
  }

  if (rawMemo == null) return ('none', null);

  final typeName = rawMemo.runtimeType.toString();

  // Differentiate MemoReturnHash ('return') vs MemoHash ('hash') explicitly
  if (typeName.contains('MemoReturnHash') ||
      typeName.toLowerCase().contains('return')) {
    return ('return', _extractHex(rawMemo));
  }
  if (typeName.contains('MemoHash') ||
      typeName.toLowerCase().contains('hash')) {
    return ('hash', _extractHex(rawMemo));
  }
  if (typeName.contains('MemoId') ||
      typeName.toLowerCase().contains('id')) {
    return ('id', _extractId(rawMemo));
  }
  if (typeName.contains('MemoText') ||
      typeName.toLowerCase().contains('text')) {
    return ('text', _extractText(rawMemo));
  }
  if (typeName.contains('MemoNone') ||
      typeName.toLowerCase().contains('none')) {
    return ('none', null);
  }

  return ('none', null);
}

String? _extractHex(dynamic memo) {
  try {
    final hexVal = memo.getHexValue();
    if (hexVal is String && hexVal.isNotEmpty) return hexVal.toLowerCase();
  } catch (_) {}
  try {
    final hexVal = memo.hexValue();
    if (hexVal is String && hexVal.isNotEmpty) return hexVal.toLowerCase();
  } catch (_) {}
  try {
    final hexVal = memo.hex;
    if (hexVal is String && hexVal.isNotEmpty) return hexVal.toLowerCase();
  } catch (_) {}
  try {
    final bytes = memo.bytes ?? memo.getMemo();
    if (bytes is List<int>) {
      return _bytesToHex(bytes);
    }
  } catch (_) {}
  try {
    final str = memo.toString();
    if (RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(str)) {
      return str.toLowerCase();
    }
  } catch (_) {}
  return null;
}

String _bytesToHex(List<int> bytes) {
  final sb = StringBuffer();
  for (final b in bytes) {
    sb.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString().toLowerCase();
}

String? _extractId(dynamic memo) {
  try {
    final id = memo.getId();
    if (id != null) return id.toString();
  } catch (_) {}
  try {
    final id = memo.id;
    if (id != null) return id.toString();
  } catch (_) {}
  return memo.toString();
}

String? _extractText(dynamic memo) {
  try {
    final text = memo.text;
    if (text is String) return text;
  } catch (_) {}
  try {
    final text = memo.getText();
    if (text is String) return text;
  } catch (_) {}
  return memo.toString();
}

String? _extractOpSource(dynamic op) {
  try {
    if (op is Map) {
      final src = op['source_account'] ?? op['sourceAccount'];
      return src?.toString();
    }
    final src = op.sourceAccount ?? op.source;
    return _extractAddressString(src);
  } catch (_) {
    return null;
  }
}

String? _extractTxSource(dynamic tx) {
  try {
    if (tx is Map) {
      final src = tx['source_account'] ?? tx['sourceAccount'];
      return src?.toString();
    }
    final src = tx.sourceAccount ?? tx.source;
    return _extractAddressString(src);
  } catch (_) {
    return null;
  }
}

String? _extractAddressString(dynamic obj) {
  if (obj == null) return null;
  if (obj is String) return obj;
  try {
    final accId = obj.accountId;
    if (accId is String && accId.isNotEmpty) return accId;
  } catch (_) {}
  try {
    final addr = obj.address;
    if (addr is String && addr.isNotEmpty) return addr;
  } catch (_) {}
  return obj.toString();
}
