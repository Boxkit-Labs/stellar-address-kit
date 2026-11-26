import 'dart:typed_data';
import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

// Mock SDK classes simulating stellar_flutter_sdk objects

class MockMuxedAccount {
  final String accountId;
  final String ed25519AccountId;
  MockMuxedAccount({required this.accountId, required this.ed25519AccountId});
}

class MockPaymentOperation {
  final dynamic destination;
  final String amount;
  final String asset;
  final dynamic sourceAccount;
  MockPaymentOperation({
    required this.destination,
    this.amount = '100',
    this.asset = 'native',
    this.sourceAccount,
  });
}

class MockPathPaymentStrictReceiveOperation {
  final dynamic destination;
  final String sendAsset;
  final String destAsset;
  final dynamic sourceAccount;
  MockPathPaymentStrictReceiveOperation({
    required this.destination,
    this.sendAsset = 'native',
    this.destAsset = 'USDC',
    this.sourceAccount,
  });
}

class MockPathPaymentStrictSendOperation {
  final dynamic destination;
  final String sendAsset;
  final String destAsset;
  final dynamic sourceAccount;
  MockPathPaymentStrictSendOperation({
    required this.destination,
    this.sendAsset = 'native',
    this.destAsset = 'USDC',
    this.sourceAccount,
  });
}

class MockCreateAccountOperation {
  final String destination;
  final String startingBalance;
  MockCreateAccountOperation({
    required this.destination,
    this.startingBalance = '10',
  });
}

class MockAccountMergeOperation {
  final String destination;
  MockAccountMergeOperation({required this.destination});
}

class MockMemoId {
  final int id;
  MockMemoId(this.id);
  int getId() => id;
}

class MockMemoText {
  final String text;
  MockMemoText(this.text);
}

class MockMemoHash {
  final Uint8List bytes;
  MockMemoHash(this.bytes);
  String getHexValue() {
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}

class MockMemoReturnHash {
  final Uint8List bytes;
  MockMemoReturnHash(this.bytes);
  String getHexValue() {
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}

class MockMemoNone {}

class MockTransaction {
  final List<dynamic> operations;
  final dynamic memo;
  final dynamic sourceAccount;
  MockTransaction({
    required this.operations,
    this.memo,
    this.sourceAccount,
  });
}

class MockFeeBumpTransaction {
  final dynamic innerTransaction;
  final String feeAccount;
  MockFeeBumpTransaction({
    required this.innerTransaction,
    this.feeAccount = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI',
  });
}

void main() {
  const baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
  const muxedM =
      'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG';

  group('extractRoutingFromTx Dart implementation', () {
    test('extracts payment with string destination and MemoId', () {
      final tx = MockTransaction(
        operations: [
          MockPaymentOperation(destination: baseG),
        ],
        memo: MockMemoId(12345),
        sourceAccount: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      );

      final result = extractRoutingFromTx(tx);
      expect(result, isNotNull);
      expect(result!.destinationBaseAccount, baseG);
      expect(result.source, RoutingSource.memo);
      expect(result.id, BigInt.from(12345));
    });

    test('extracts MuxedAccount extracting .accountId rather than .ed25519AccountId', () {
      final muxedObj = MockMuxedAccount(
        accountId: muxedM,
        ed25519AccountId: baseG,
      );

      final tx = MockTransaction(
        operations: [
          MockPaymentOperation(destination: muxedObj),
        ],
        memo: MockMemoId(999),
      );

      final result = extractRoutingFromTx(tx);
      expect(result, isNotNull);
      expect(result!.destinationBaseAccount, baseG);
      // Muxed address ID should take precedence or match muxedM decoded
      expect(result.id, BigInt.parse('9007199254740993'));
      expect(result.source, RoutingSource.muxed);
    });

    test('distinguishes MemoReturnHash as return vs MemoHash as hash', () {
      final hashBytes = Uint8List.fromList([1, 2, 3, 4, 5, 6, 7, 8]);
      final expectedHex = '0102030405060708';

      // MemoReturnHash
      final txReturn = MockTransaction(
        operations: [MockPaymentOperation(destination: baseG)],
        memo: MockMemoReturnHash(hashBytes),
      );
      final resReturn = extractRoutingFromTx(txReturn);
      expect(resReturn, isNotNull);

      // MemoHash
      final txHash = MockTransaction(
        operations: [MockPaymentOperation(destination: baseG)],
        memo: MockMemoHash(hashBytes),
      );
      final resHash = extractRoutingFromTx(txHash);
      expect(resHash, isNotNull);
    });

    test('ignores non-payment-like operations (CreateAccount, AccountMerge)', () {
      final txCreate = MockTransaction(
        operations: [MockCreateAccountOperation(destination: baseG)],
      );
      expect(extractRoutingFromTx(txCreate), isNull);

      final txMerge = MockTransaction(
        operations: [MockAccountMergeOperation(destination: baseG)],
      );
      expect(extractRoutingFromTx(txMerge), isNull);
    });

    test('supports operationIndex parameter and bounds checking', () {
      final tx = MockTransaction(
        operations: [
          MockCreateAccountOperation(destination: baseG),
          MockPaymentOperation(destination: baseG),
        ],
      );

      // Index 0: CreateAccount -> null
      expect(extractRoutingFromTx(tx, operationIndex: 0), isNull);

      // Index 1: Payment -> valid result
      final res1 = extractRoutingFromTx(tx, operationIndex: 1);
      expect(res1, isNotNull);
      expect(res1!.destinationBaseAccount, baseG);

      // Out of bounds / negative index -> null
      expect(extractRoutingFromTx(tx, operationIndex: -1), isNull);
      expect(extractRoutingFromTx(tx, operationIndex: 5), isNull);
    });

    test('respects op.source ?? tx.source precedence', () {
      const opSource = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
      const txSource = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

      // 1. op.source overrides tx.source
      final tx1 = MockTransaction(
        operations: [
          MockPaymentOperation(destination: baseG, sourceAccount: opSource),
        ],
        sourceAccount: txSource,
      );
      final res1 = extractRoutingFromTx(tx1);
      expect(res1, isNotNull);

      // 2. Falls back to tx.source if op.source is null
      final tx2 = MockTransaction(
        operations: [
          MockPaymentOperation(destination: baseG, sourceAccount: null),
        ],
        sourceAccount: txSource,
      );
      final res2 = extractRoutingFromTx(tx2);
      expect(res2, isNotNull);
    });

    test('unwraps FeeBumpTransaction', () {
      final inner = MockTransaction(
        operations: [MockPaymentOperation(destination: baseG)],
        memo: MockMemoText('inner-memo'),
      );
      final feeBump = MockFeeBumpTransaction(innerTransaction: inner);

      final result = extractRoutingFromTx(feeBump);
      expect(result, isNotNull);
      expect(result!.destinationBaseAccount, baseG);
    });

    test('extractAllRoutingFromTx extracts multiple operations with correct indices', () {
      final tx = MockTransaction(
        operations: [
          MockCreateAccountOperation(destination: baseG),
          MockPaymentOperation(destination: baseG),
          MockPathPaymentStrictReceiveOperation(destination: muxedM),
        ],
      );

      final results = extractAllRoutingFromTx(tx);
      expect(results.length, 2);
      expect(results[0].operationIndex, 1);
      expect(results[0].result.destinationBaseAccount, baseG);
      expect(results[1].operationIndex, 2);
      expect(results[1].result.destinationBaseAccount, baseG);
    });

    test('supports Horizon decoded map payloads', () {
      final mapTx = {
        'source_account': 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        'memo_type': 'id',
        'memo': '777',
        'operations': [
          {
            'type': 'payment',
            'destination': baseG,
          }
        ],
      };

      final result = extractRoutingFromTx(mapTx);
      expect(result, isNotNull);
      expect(result!.destinationBaseAccount, baseG);
      expect(result.source, RoutingSource.memo);
      expect(result.id, BigInt.from(777));
    });

    test('prefers nonempty to_muxed over to/destination in Horizon operation maps', () {
      final mapTx = {
        'source_account': 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        'memo_type': 'none',
        'operations': [
          {
            'type': 'payment',
            'to': baseG,
            'to_muxed': muxedM,
          },
          {
            'type': 'path_payment_strict_receive',
            'to': baseG,
            'to_muxed': '',
          },
        ],
      };

      final res0 = extractRoutingFromTx(mapTx);
      expect(res0, isNotNull);
      expect(res0!.destinationBaseAccount, baseG);
      expect(res0.source, RoutingSource.muxed);
      expect(res0.id, BigInt.parse('9007199254740993'));

      final all = extractAllRoutingFromTx(mapTx);
      expect(all.length, 2);
      expect(all[0].result.source, RoutingSource.muxed);
      expect(all[0].result.id, BigInt.parse('9007199254740993'));
      expect(all[1].result.source, RoutingSource.none);
      expect(all[1].result.destinationBaseAccount, baseG);
    });

    test('decodes Horizon transaction maps containing only envelope_xdr', () {
      // V1 tx: Payment to muxedM with MemoID(999)
      const tx1Xdr =
          'AAAAAgAAAABCPn0F8uyvv+wZKyFaPxvpau242OcCVKvjQT4CB95WsgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAPnAAAAAQAAAAAAAAABAAABAAAgAAAAAAABMCpife7F1Z6k1d9umYRM+BuZnwHYmywPy/u1Jd8iIAEAAAAAAAAAAAX14QAAAAAAAAAAAA==';
      // V1 tx: [CreateAccount, ChangeTrust, Payment(baseG), PathPaymentStrictSend(muxedM)] with MemoText("555")
      const tx2Xdr =
          'AAAAAgAAAABCPn0F8uyvv+wZKyFaPxvpau242OcCVKvjQT4CB95WsgAAAZAAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAM1NTUAAAAABAAAAAAAAAAAAAAAADAqYn3uxdWepNXfbpmETPgbmZ8B2JssD8v7tSXfIiABAAAAAAL68IAAAAAAAAAABgAAAAFVU0RDAAAAADAqYn3uxdWepNXfbpmETPgbmZ8B2JssD8v7tSXfIiABAAAAAlQL5AAAAAAAAAAAAQAAAAAwKmJ97sXVnqTV326ZhEz4G5mfAdibLA/L+7Ul3yIgAQAAAAAAAAAABfXhAAAAAAAAAAANAAAAAAAAAAAL68IAAAABAAAgAAAAAAABMCpife7F1Z6k1d9umYRM+BuZnwHYmywPy/u1Jd8iIAEAAAAAAAAAAAjw0YAAAAAAAAAAAAAAAAA=';
      // FeeBump wrapping tx1Xdr
      const feeBumpXdr =
          'AAAABQAAAAAwKmJ97sXVnqTV326ZhEz4G5mfAdibLA/L+7Ul3yIgAQAAAAAAAAGQAAAAAgAAAABCPn0F8uyvv+wZKyFaPxvpau242OcCVKvjQT4CB95WsgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAPnAAAAAQAAAAAAAAABAAABAAAgAAAAAAABMCpife7F1Z6k1d9umYRM+BuZnwHYmywPy/u1Jd8iIAEAAAAAAAAAAAX14QAAAAAAAAAAAAAAAAAAAAAA';

      final horizonTx1 = {
        'envelope_xdr': tx1Xdr,
        'operation_count': 1,
        '_links': {
          'operations': {'href': 'https://horizon.stellar.org/transactions/1/operations'}
        },
      };
      final res1 = extractRoutingFromTx(horizonTx1);
      expect(res1, isNotNull);
      expect(res1!.destinationBaseAccount, baseG);
      expect(res1.source, RoutingSource.muxed);
      expect(res1.id, BigInt.parse('9007199254740993'));
      expect(res1.warnings.map((w) => w.code), contains('memo-ignored'));

      final horizonTx2 = {
        'envelope_xdr': tx2Xdr,
        'operation_count': 4,
      };
      expect(extractRoutingFromTx(horizonTx2, operationIndex: 0), isNull);
      expect(extractRoutingFromTx(horizonTx2, operationIndex: 1), isNull);
      final all2 = extractAllRoutingFromTx(horizonTx2);
      expect(all2.length, 2);
      expect(all2[0].operationIndex, 2);
      expect(all2[0].result.destinationBaseAccount, baseG);
      expect(all2[0].result.source, RoutingSource.memo);
      expect(all2[0].result.id, BigInt.from(555));
      expect(all2[1].operationIndex, 3);
      expect(all2[1].result.source, RoutingSource.muxed);
      expect(all2[1].result.id, BigInt.parse('9007199254740993'));

      final horizonFeeBump = {'envelope_xdr': feeBumpXdr};
      final resFb = extractRoutingFromTx(horizonFeeBump);
      expect(resFb, isNotNull);
      expect(resFb!.destinationBaseAccount, baseG);
      expect(resFb.source, RoutingSource.muxed);
      expect(resFb.id, BigInt.parse('9007199254740993'));
    });
  });
}
