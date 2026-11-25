import 'dart:convert';
import 'dart:typed_data';

import '../muxed/encode.dart';
import '../util/strkey.dart';

/// Decoded summary of a Stellar `TransactionEnvelope` XDR payload.
final class DecodedTransactionEnvelope {
  final String sourceAccount;
  final String memoType;
  final String? memoValue;
  final List<Map<String, dynamic>> operations;

  const DecodedTransactionEnvelope({
    required this.sourceAccount,
    required this.memoType,
    required this.memoValue,
    required this.operations,
  });

  Map<String, dynamic> toHorizonMap() => {
        'source_account': sourceAccount,
        'memo_type': memoType,
        if (memoValue != null) 'memo': memoValue,
        'operations': operations,
      };
}

/// Decodes a base64-encoded Stellar `TransactionEnvelope` XDR string into
/// its inner transaction source account, memo, and operations list.
///
/// Supports `ENVELOPE_TYPE_TX_V0` (0), `ENVELOPE_TYPE_TX` (2), and
/// `ENVELOPE_TYPE_TX_FEE_BUMP` (5) (unwrapping the inner V1 transaction).
/// Returns `null` if the input is invalid base64 or malformed XDR.
DecodedTransactionEnvelope? decodeTransactionEnvelopeXdr(String base64Xdr) {
  try {
    final normalized = base64Xdr.trim();
    if (normalized.isEmpty) return null;
    final bytes = base64Decode(normalized);
    final reader = _XdrReader(bytes);
    return _readTransactionEnvelope(reader);
  } catch (_) {
    return null;
  }
}

const int _envelopeTypeTxV0 = 0;
const int _envelopeTypeTx = 2;
const int _envelopeTypeTxFeeBump = 5;

const int _cryptoKeyTypeEd25519 = 0;
const int _cryptoKeyTypeMuxedEd25519 = 0x100;

const int _maxOperations = 100;
const int _maxSkipDepth = 32;

DecodedTransactionEnvelope _readTransactionEnvelope(_XdrReader r) {
  final envType = r.readInt32();
  switch (envType) {
    case _envelopeTypeTxV0:
      return _readTransactionV0(r);
    case _envelopeTypeTx:
      return _readTransactionV1(r);
    case _envelopeTypeTxFeeBump:
      // FeeBumpTransaction: feeSource (MuxedAccount) + fee (int64) + innerTx union
      _skipMuxedAccount(r);
      r.skip(8);
      final innerType = r.readInt32();
      if (innerType != _envelopeTypeTx) {
        throw FormatException('Unsupported fee-bump inner envelope: $innerType');
      }
      return _readTransactionV1(r);
    default:
      throw FormatException('Unsupported TransactionEnvelope type: $envType');
  }
}

DecodedTransactionEnvelope _readTransactionV0(_XdrReader r) {
  final sourceAccount = _encodeEd25519PublicKey(r.readFixedOpaque(32));
  r.skip(4); // fee
  r.skip(8); // seqNum
  if (r.readBool()) {
    r.skip(16); // TimeBounds
  }
  final (memoType, memoValue) = _readMemo(r);
  final ops = _readOperations(r);
  return DecodedTransactionEnvelope(
    sourceAccount: sourceAccount,
    memoType: memoType,
    memoValue: memoValue,
    operations: ops,
  );
}

DecodedTransactionEnvelope _readTransactionV1(_XdrReader r) {
  final sourceAccount = _readMuxedAccount(r);
  r.skip(4); // fee
  r.skip(8); // seqNum
  _skipPreconditions(r);
  final (memoType, memoValue) = _readMemo(r);
  final ops = _readOperations(r);
  return DecodedTransactionEnvelope(
    sourceAccount: sourceAccount,
    memoType: memoType,
    memoValue: memoValue,
    operations: ops,
  );
}

List<Map<String, dynamic>> _readOperations(_XdrReader r) {
  final count = r.readUint32();
  if (count > _maxOperations) {
    throw FormatException('Operation count exceeds maximum: $count');
  }
  final ops = <Map<String, dynamic>>[];
  for (var i = 0; i < count; i++) {
    ops.add(_readOperation(r));
  }
  return ops;
}

Map<String, dynamic> _readOperation(_XdrReader r) {
  String? opSource;
  if (r.readBool()) {
    opSource = _readMuxedAccount(r);
  }
  final opType = r.readInt32();
  switch (opType) {
    case 0: // CREATE_ACCOUNT
      _skipAccountId(r);
      r.skip(8);
      return {
        'type': 'create_account',
        if (opSource != null) 'source_account': opSource,
      };
    case 1: // PAYMENT
      final dest = _readMuxedAccount(r);
      _skipAsset(r);
      r.skip(8);
      return {
        'type': 'payment',
        'destination': dest,
        if (opSource != null) 'source_account': opSource,
      };
    case 2: // PATH_PAYMENT_STRICT_RECEIVE
      _skipAsset(r);
      r.skip(8);
      final dest = _readMuxedAccount(r);
      _skipAsset(r);
      r.skip(8);
      _skipAssetArray(r);
      return {
        'type': 'path_payment_strict_receive',
        'destination': dest,
        if (opSource != null) 'source_account': opSource,
      };
    case 3: // MANAGE_SELL_OFFER
    case 12: // MANAGE_BUY_OFFER
      _skipAsset(r);
      _skipAsset(r);
      r.skip(8 + 8 + 8);
      return {'type': opType == 3 ? 'manage_sell_offer' : 'manage_buy_offer'};
    case 4: // CREATE_PASSIVE_SELL_OFFER
      _skipAsset(r);
      _skipAsset(r);
      r.skip(8 + 8);
      return {'type': 'create_passive_sell_offer'};
    case 5: // SET_OPTIONS
      if (r.readBool()) _skipAccountId(r);
      if (r.readBool()) r.skip(4);
      if (r.readBool()) r.skip(4);
      if (r.readBool()) r.skip(4);
      if (r.readBool()) r.skip(4);
      if (r.readBool()) r.skip(4);
      if (r.readBool()) r.skip(4);
      if (r.readBool()) r.skipVarOpaque();
      if (r.readBool()) {
        _skipSignerKey(r);
        r.skip(4);
      }
      return {'type': 'set_options'};
    case 6: // CHANGE_TRUST
      _skipChangeTrustAsset(r);
      r.skip(8);
      return {'type': 'change_trust'};
    case 7: // ALLOW_TRUST
      _skipAccountId(r);
      _skipAssetCode(r);
      r.skip(4);
      return {'type': 'allow_trust'};
    case 8: // ACCOUNT_MERGE
      _skipMuxedAccount(r);
      return {'type': 'account_merge'};
    case 9: // INFLATION
    case 17: // END_SPONSORING_FUTURE_RESERVES
      return {'type': opType == 9 ? 'inflation' : 'end_sponsoring_future_reserves'};
    case 10: // MANAGE_DATA
      r.skipVarOpaque();
      if (r.readBool()) r.skipVarOpaque();
      return {'type': 'manage_data'};
    case 11: // BUMP_SEQUENCE
      r.skip(8);
      return {'type': 'bump_sequence'};
    case 13: // PATH_PAYMENT_STRICT_SEND
      _skipAsset(r);
      r.skip(8);
      final dest = _readMuxedAccount(r);
      _skipAsset(r);
      r.skip(8);
      _skipAssetArray(r);
      return {
        'type': 'path_payment_strict_send',
        'destination': dest,
        if (opSource != null) 'source_account': opSource,
      };
    case 14: // CREATE_CLAIMABLE_BALANCE
      _skipAsset(r);
      r.skip(8);
      final count = r.readUint32();
      for (var i = 0; i < count; i++) {
        final claimantType = r.readInt32();
        if (claimantType != 0) {
          throw FormatException('Unsupported ClaimantType: $claimantType');
        }
        _skipAccountId(r);
        _skipClaimPredicate(r, 0);
      }
      return {'type': 'create_claimable_balance'};
    case 15: // CLAIM_CLAIMABLE_BALANCE
    case 20: // CLAWBACK_CLAIMABLE_BALANCE
      r.skip(4 + 32);
      return {
        'type': opType == 15
            ? 'claim_claimable_balance'
            : 'clawback_claimable_balance',
      };
    case 16: // BEGIN_SPONSORING_FUTURE_RESERVES
      _skipAccountId(r);
      return {'type': 'begin_sponsoring_future_reserves'};
    case 18: // REVOKE_SPONSORSHIP
      final revType = r.readInt32();
      if (revType == 0) {
        _skipLedgerKey(r);
      } else if (revType == 1) {
        _skipAccountId(r);
        _skipSignerKey(r);
      } else {
        throw FormatException('Unsupported RevokeSponsorshipType: $revType');
      }
      return {'type': 'revoke_sponsorship'};
    case 19: // CLAWBACK
      _skipAsset(r);
      _skipMuxedAccount(r);
      r.skip(8);
      return {'type': 'clawback'};
    case 21: // SET_TRUST_LINE_FLAGS
      _skipAccountId(r);
      _skipAsset(r);
      r.skip(8);
      return {'type': 'set_trust_line_flags'};
    case 22: // LIQUIDITY_POOL_DEPOSIT
      r.skip(32 + 8 + 8 + 8 + 8);
      return {'type': 'liquidity_pool_deposit'};
    case 23: // LIQUIDITY_POOL_WITHDRAW
      r.skip(32 + 8 + 8 + 8);
      return {'type': 'liquidity_pool_withdraw'};
    case 24: // INVOKE_HOST_FUNCTION
      _skipHostFunction(r);
      final authCount = r.readUint32();
      for (var i = 0; i < authCount; i++) {
        _skipSorobanAuthEntry(r, 0);
      }
      return {'type': 'invoke_host_function'};
    case 25: // EXTEND_FOOTPRINT_TTL
      r.skip(8);
      return {'type': 'extend_footprint_ttl'};
    case 26: // RESTORE_FOOTPRINT
      r.skip(4);
      return {'type': 'restore_footprint'};
    default:
      throw FormatException('Unsupported OperationType: $opType');
  }
}

(String, String?) _readMemo(_XdrReader r) {
  final memoType = r.readInt32();
  switch (memoType) {
    case 0:
      return ('none', null);
    case 1:
      return ('text', r.readString(28));
    case 2:
      return ('id', r.readUint64().toString());
    case 3:
      return ('hash', _bytesToHex(r.readFixedOpaque(32)));
    case 4:
      return ('return', _bytesToHex(r.readFixedOpaque(32)));
    default:
      throw FormatException('Unsupported MemoType: $memoType');
  }
}

String _readMuxedAccount(_XdrReader r) {
  final keyType = r.readInt32();
  if (keyType == _cryptoKeyTypeEd25519) {
    return _encodeEd25519PublicKey(r.readFixedOpaque(32));
  }
  if (keyType == _cryptoKeyTypeMuxedEd25519) {
    // In XDR med25519, uint64 id precedes uint256 ed25519.
    final id = r.readUint64();
    final ed25519 = r.readFixedOpaque(32);
    return MuxedEncoder.encodeMuxed(ed25519, id) as String;
  }
  throw FormatException('Unsupported CryptoKeyType: $keyType');
}

void _skipMuxedAccount(_XdrReader r) {
  final keyType = r.readInt32();
  if (keyType == _cryptoKeyTypeEd25519) {
    r.skip(32);
  } else if (keyType == _cryptoKeyTypeMuxedEd25519) {
    r.skip(8 + 32);
  } else {
    throw FormatException('Unsupported CryptoKeyType: $keyType');
  }
}

void _skipAccountId(_XdrReader r) {
  final keyType = r.readInt32();
  if (keyType != _cryptoKeyTypeEd25519) {
    throw FormatException('Unsupported AccountID type: $keyType');
  }
  r.skip(32);
}

void _skipSignerKey(_XdrReader r) {
  final keyType = r.readInt32();
  switch (keyType) {
    case 0:
    case 1:
    case 2:
      r.skip(32);
      break;
    case 3:
      r.skip(32);
      r.skipVarOpaque();
      break;
    default:
      throw FormatException('Unsupported SignerKeyType: $keyType');
  }
}

void _skipPreconditions(_XdrReader r) {
  final condType = r.readInt32();
  switch (condType) {
    case 0:
      break;
    case 1:
      r.skip(16);
      break;
    case 2:
      if (r.readBool()) r.skip(16);
      if (r.readBool()) r.skip(8);
      if (r.readBool()) r.skip(8);
      r.skip(8 + 4);
      final extraCount = r.readUint32();
      for (var i = 0; i < extraCount; i++) {
        _skipSignerKey(r);
      }
      break;
    default:
      throw FormatException('Unsupported PreconditionType: $condType');
  }
}

void _skipAsset(_XdrReader r) {
  final assetType = r.readInt32();
  switch (assetType) {
    case 0:
      break;
    case 1:
      r.skip(4);
      _skipAccountId(r);
      break;
    case 2:
      r.skip(12);
      _skipAccountId(r);
      break;
    default:
      throw FormatException('Unsupported AssetType: $assetType');
  }
}

void _skipAssetArray(_XdrReader r) {
  final count = r.readUint32();
  for (var i = 0; i < count; i++) {
    _skipAsset(r);
  }
}

void _skipChangeTrustAsset(_XdrReader r) {
  final assetType = r.readInt32();
  switch (assetType) {
    case 0:
      break;
    case 1:
      r.skip(4);
      _skipAccountId(r);
      break;
    case 2:
      r.skip(12);
      _skipAccountId(r);
      break;
    case 3:
      final poolType = r.readInt32();
      if (poolType != 0) {
        throw FormatException('Unsupported LiquidityPoolType: $poolType');
      }
      _skipAsset(r);
      _skipAsset(r);
      r.skip(4);
      break;
    default:
      throw FormatException('Unsupported ChangeTrustAsset type: $assetType');
  }
}

void _skipTrustLineAsset(_XdrReader r) {
  final assetType = r.readInt32();
  switch (assetType) {
    case 0:
      break;
    case 1:
      r.skip(4);
      _skipAccountId(r);
      break;
    case 2:
      r.skip(12);
      _skipAccountId(r);
      break;
    case 3:
      r.skip(32);
      break;
    default:
      throw FormatException('Unsupported TrustLineAsset type: $assetType');
  }
}

void _skipAssetCode(_XdrReader r) {
  final assetType = r.readInt32();
  if (assetType == 1) {
    r.skip(4);
  } else if (assetType == 2) {
    r.skip(12);
  } else {
    throw FormatException('Unsupported AssetCode type: $assetType');
  }
}

void _skipClaimPredicate(_XdrReader r, int depth) {
  if (depth > _maxSkipDepth) {
    throw const FormatException('Max XDR nesting depth exceeded');
  }
  final predType = r.readInt32();
  switch (predType) {
    case 0:
      break;
    case 1:
    case 2:
      final count = r.readUint32();
      for (var i = 0; i < count; i++) {
        _skipClaimPredicate(r, depth + 1);
      }
      break;
    case 3:
      if (r.readBool()) _skipClaimPredicate(r, depth + 1);
      break;
    case 4:
    case 5:
      r.skip(8);
      break;
    default:
      throw FormatException('Unsupported ClaimPredicateType: $predType');
  }
}

void _skipLedgerKey(_XdrReader r) {
  final entryType = r.readInt32();
  switch (entryType) {
    case 0:
      _skipAccountId(r);
      break;
    case 1:
      _skipAccountId(r);
      _skipTrustLineAsset(r);
      break;
    case 2:
      _skipAccountId(r);
      r.skip(8);
      break;
    case 3:
      _skipAccountId(r);
      r.skipVarOpaque();
      break;
    case 4:
      r.skip(4 + 32);
      break;
    case 5:
    case 7:
    case 9:
      r.skip(32);
      break;
    case 6:
      _skipSCAddress(r);
      _skipSCVal(r, 0);
      r.skip(4);
      break;
    case 8:
      r.skip(4);
      break;
    default:
      throw FormatException('Unsupported LedgerEntryType: $entryType');
  }
}

void _skipSCAddress(_XdrReader r) {
  final addrType = r.readInt32();
  if (addrType == 0) {
    _skipAccountId(r);
  } else if (addrType == 1) {
    r.skip(32);
  } else {
    throw FormatException('Unsupported SCAddressType: $addrType');
  }
}

void _skipContractExecutable(_XdrReader r) {
  final execType = r.readInt32();
  if (execType == 0) {
    r.skip(32);
  } else if (execType != 1) {
    throw FormatException('Unsupported ContractExecutableType: $execType');
  }
}

void _skipContractIDPreimage(_XdrReader r) {
  final preType = r.readInt32();
  if (preType == 0) {
    _skipSCAddress(r);
    r.skip(32);
  } else if (preType == 1) {
    _skipAsset(r);
  } else {
    throw FormatException('Unsupported ContractIDPreimageType: $preType');
  }
}

void _skipSCVal(_XdrReader r, int depth) {
  if (depth > _maxSkipDepth) {
    throw const FormatException('Max XDR nesting depth exceeded');
  }
  final valType = r.readInt32();
  switch (valType) {
    case 0:
    case 3:
    case 4:
      r.skip(4);
      break;
    case 1:
    case 20:
      break;
    case 2:
    case 5:
    case 6:
    case 7:
    case 8:
    case 21:
      r.skip(8);
      break;
    case 9:
    case 10:
      r.skip(16);
      break;
    case 11:
    case 12:
      r.skip(32);
      break;
    case 13:
    case 14:
    case 15:
      r.skipVarOpaque();
      break;
    case 16:
      if (r.readBool()) {
        final count = r.readUint32();
        for (var i = 0; i < count; i++) {
          _skipSCVal(r, depth + 1);
        }
      }
      break;
    case 17:
      if (r.readBool()) {
        final count = r.readUint32();
        for (var i = 0; i < count; i++) {
          _skipSCVal(r, depth + 1);
          _skipSCVal(r, depth + 1);
        }
      }
      break;
    case 18:
      _skipSCAddress(r);
      break;
    case 19:
      _skipContractExecutable(r);
      if (r.readBool()) {
        final count = r.readUint32();
        for (var i = 0; i < count; i++) {
          _skipSCVal(r, depth + 1);
          _skipSCVal(r, depth + 1);
        }
      }
      break;
    default:
      throw FormatException('Unsupported SCValType: $valType');
  }
}

void _skipHostFunction(_XdrReader r) {
  final fnType = r.readInt32();
  switch (fnType) {
    case 0:
      _skipSCAddress(r);
      r.skipVarOpaque();
      final count = r.readUint32();
      for (var i = 0; i < count; i++) {
        _skipSCVal(r, 0);
      }
      break;
    case 1:
      _skipContractIDPreimage(r);
      _skipContractExecutable(r);
      break;
    case 2:
      r.skipVarOpaque();
      break;
    case 3:
      _skipContractIDPreimage(r);
      _skipContractExecutable(r);
      final count = r.readUint32();
      for (var i = 0; i < count; i++) {
        _skipSCVal(r, 0);
      }
      break;
    default:
      throw FormatException('Unsupported HostFunctionType: $fnType');
  }
}

void _skipSorobanAuthEntry(_XdrReader r, int depth) {
  final credType = r.readInt32();
  if (credType == 1) {
    _skipSCAddress(r);
    r.skip(8 + 4);
    _skipSCVal(r, 0);
  } else if (credType != 0) {
    throw FormatException('Unsupported SorobanCredentialsType: $credType');
  }
  _skipSorobanAuthorizedInvocation(r, depth);
}

void _skipSorobanAuthorizedInvocation(_XdrReader r, int depth) {
  if (depth > _maxSkipDepth) {
    throw const FormatException('Max XDR nesting depth exceeded');
  }
  final fnType = r.readInt32();
  switch (fnType) {
    case 0:
      _skipSCAddress(r);
      r.skipVarOpaque();
      final count = r.readUint32();
      for (var i = 0; i < count; i++) {
        _skipSCVal(r, 0);
      }
      break;
    case 1:
      _skipContractIDPreimage(r);
      _skipContractExecutable(r);
      break;
    case 2:
      _skipContractIDPreimage(r);
      _skipContractExecutable(r);
      final count = r.readUint32();
      for (var i = 0; i < count; i++) {
        _skipSCVal(r, 0);
      }
      break;
    default:
      throw FormatException('Unsupported SorobanAuthorizedFunctionType: $fnType');
  }
  final subCount = r.readUint32();
  for (var i = 0; i < subCount; i++) {
    _skipSorobanAuthorizedInvocation(r, depth + 1);
  }
}

String _encodeEd25519PublicKey(Uint8List pubkey) {
  final data = Uint8List(35);
  data[0] = 0x30; // Ed25519 public key version byte ('G')
  data.setRange(1, 33, pubkey);
  final checksum = StrKeyUtil.calculateChecksum(Uint8List.sublistView(data, 0, 33));
  data[33] = checksum & 0xFF;
  data[34] = (checksum >> 8) & 0xFF;
  return StrKeyUtil.encodeBase32(data);
}

String _bytesToHex(Uint8List bytes) {
  final sb = StringBuffer();
  for (final b in bytes) {
    sb.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString();
}

final class _XdrReader {
  final Uint8List _bytes;
  final ByteData _bd;
  int _offset = 0;

  _XdrReader(this._bytes)
      : _bd = ByteData.sublistView(_bytes);

  void _require(int count) {
    if (count < 0 || _offset + count > _bytes.length) {
      throw const FormatException('Unexpected end of XDR buffer');
    }
  }

  int readInt32() {
    _require(4);
    final v = _bd.getInt32(_offset, Endian.big);
    _offset += 4;
    return v;
  }

  int readUint32() {
    _require(4);
    final v = _bd.getUint32(_offset, Endian.big);
    _offset += 4;
    return v;
  }

  BigInt readUint64() {
    final hi = readUint32();
    final lo = readUint32();
    return (BigInt.from(hi) << 32) | BigInt.from(lo);
  }

  bool readBool() {
    final v = readInt32();
    if (v != 0 && v != 1) {
      throw FormatException('Invalid XDR bool: $v');
    }
    return v != 0;
  }

  void skip(int byteCount) {
    _require(byteCount);
    _offset += byteCount;
  }

  Uint8List readFixedOpaque(int len) {
    final padded = (len + 3) & ~3;
    _require(padded);
    final out = Uint8List.sublistView(_bytes, _offset, _offset + len);
    _offset += padded;
    return out;
  }

  Uint8List readVarOpaque([int? maxLen]) {
    final len = readUint32();
    if (maxLen != null && len > maxLen) {
      throw FormatException('XDR opaque length $len exceeds max $maxLen');
    }
    return readFixedOpaque(len);
  }

  void skipVarOpaque() {
    final len = readUint32();
    final padded = (len + 3) & ~3;
    skip(padded);
  }

  String readString([int? maxLen]) {
    return utf8.decode(readVarOpaque(maxLen), allowMalformed: true);
  }
}
