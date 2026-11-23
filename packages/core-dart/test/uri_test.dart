import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

void main() {
  const g = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
  const m =
      'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG';

  group('extractRoutingFromURI', () {
    test('routes MEMO_ID with payment params', () {
      final r = extractRoutingFromURI(
        'web+stellar:pay?destination=$g&amount=10&memo=42&memo_type=MEMO_ID&asset_code=USDC&asset_issuer=$g',
      );
      expect(r.error, isNull);
      expect(r.result!.idString, '42');
      expect(r.result!.source, RoutingSource.memo);
      expect(r.amount, '10');
      expect(r.assetCode, 'USDC');
      expect(r.assetIssuer, g);
    });

    test('defaults to MEMO_TEXT and decodes percent-encoding', () {
      final r = extractRoutingFromURI(
        'WEB+STELLAR:pay?destination=$g&memo=%34%32',
      );
      expect(r.result!.idString, '42');
    });

    test('routes M-address', () {
      final r = extractRoutingFromURI('web+stellar:pay?destination=$m');
      expect(r.result!.source, RoutingSource.muxed);
    });

    test('rejects bad hash encoding', () {
      final r = extractRoutingFromURI(
        'web+stellar:pay?destination=$g&memo=zz&memo_type=MEMO_RETURN',
      );
      expect(r.error!.code, UriErrorCode.invalidEncoding);
    });

    test('structured errors without throwing', () {
      UriErrorCode? c(String s) => extractRoutingFromURI(s).error?.code;
      expect(c(''), UriErrorCode.invalidUri);
      expect(c('https://x'), UriErrorCode.invalidUri);
      expect(c('web+stellar:tx?xdr=AAAA'), UriErrorCode.unsupportedOperation);
      expect(c('web+stellar:pay?amount=1'), UriErrorCode.missingDestination);
      expect(
        c('web+stellar:pay?destination=%ZZ'),
        UriErrorCode.invalidEncoding,
      );
      expect(
        c('web+stellar:pay?destination=$g&memo=1&memo_type=BAD'),
        UriErrorCode.invalidUri,
      );
      expect(
        c('web+stellar:pay?destination=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),
        UriErrorCode.invalidUri,
      );
    });
  });
}
