import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

void main() {
  group('extractRoutingFromURI', () {
    group('scheme validation', () {
      test('rejects URIs without web+stellar scheme', () {
        final result = extractRoutingFromURI('https://example.com/pay?destination=G...');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.invalidUri);
        }
      });

      test('rejects empty string', () {
        final result = extractRoutingFromURI('');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.invalidUri);
        }
      });
    });

    group('operation validation', () {
      test('rejects unsupported tx operation', () {
        final result = extractRoutingFromURI('web+stellar:tx?xdr=AAAA...');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.unsupportedOperation);
        }
      });

      test('rejects unknown operations', () {
        final result = extractRoutingFromURI('web+stellar:unknown?destination=G...');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.unsupportedOperation);
        }
      });
    });

    group('destination validation', () {
      test('rejects missing destination', () {
        final result = extractRoutingFromURI('web+stellar:pay?amount=100');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.missingDestination);
        }
      });

      test('rejects empty destination', () {
        final result = extractRoutingFromURI('web+stellar:pay?destination=');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.missingDestination);
        }
      });
    });

    group('successful parsing with G-address', () {
      const validG = 'GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO';

      test('parses basic pay URI with destination only', () {
        final result = extractRoutingFromURI('web+stellar:pay?destination=$validG');
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.destination, validG);
          expect(result.rawParams.memo, isNull);
          expect(result.rawParams.memoType, isNull);
          expect(result.routing.destinationBaseAccount, validG);
        }
      });

      test('parses URI with memo and memo_type', () {
        final uri = 'web+stellar:pay?destination=$validG&memo=123&memo_type=MEMO_ID';
        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.memo, '123');
          expect(result.rawParams.memoType, 'MEMO_ID');
          expect(result.routing.id, BigInt.from(123));
          expect(result.routing.idString, '123');
        }
      });

      test('parses URI with URL-encoded memo text', () {
        final uri = 'web+stellar:pay?destination=$validG&memo=hello%20world&memo_type=MEMO_TEXT';
        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.memo, 'hello world');
          expect(result.rawParams.memoType, 'MEMO_TEXT');
        }
      });

      test('parses URI with all optional parameters', () {
        const issuer = 'GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S';
        final uri = 'web+stellar:pay?destination=$validG'
            '&amount=100.1234567'
            '&asset_code=USDC'
            '&asset_issuer=$issuer'
            '&memo=invoice%23123'
            '&memo_type=MEMO_TEXT'
            '&callback=url%3Ahttps%3A%2F%2Fexample.com%2Fcallback'
            '&msg=Pay%20me%20with%20lumens'
            '&origin_domain=example.com';

        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.destination, validG);
          expect(result.rawParams.amount, '100.1234567');
          expect(result.rawParams.assetCode, 'USDC');
          expect(result.rawParams.assetIssuer, issuer);
          expect(result.rawParams.memo, 'invoice#123');
          expect(result.rawParams.memoType, 'MEMO_TEXT');
          expect(result.rawParams.callback, 'url:https://example.com/callback');
          expect(result.rawParams.msg, 'Pay me with lumens');
          expect(result.rawParams.originDomain, 'example.com');
        }
      });
    });

    group('M-address handling', () {
      const mAddress =
          'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672';

      test('passes M-address to extractRouting for canonical expansion', () {
        final uri = 'web+stellar:pay?destination=$mAddress';
        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.routing.destinationBaseAccount, startsWith('G'));
          expect(result.routing.id, isNotNull);
        }
      });
    });

    group('edge cases', () {
      const validG = 'GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO';

      test('handles URI with no query parameters', () {
        final result = extractRoutingFromURI('web+stellar:pay');
        expect(result.success, isFalse);
        if (result is ExtractRoutingFromUriFailure) {
          expect(result.code, Sep7UriErrorCode.missingDestination);
        }
      });

      test('handles malformed URL encoding gracefully', () {
        final uri = 'web+stellar:pay?destination=$validG&memo=%ZZ';
        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.memo, '%ZZ');
        }
      });

      test('trims whitespace from destination', () {
        final uri = 'web+stellar:pay?destination=%20$validG%20';
        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.destination, validG);
        }
      });
    });

    group('protocol boundaries and adversarial inputs', () {
      const validG = 'GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO';

      test('handles uint64 boundary memo values', () {
        const boundaries = <String>[
          '0',
          '1',
          '18446744073709551615',
          '18446744073709551616',
        ];
        for (final value in boundaries) {
          final uri =
              'web+stellar:pay?destination=$validG&memo=$value&memo_type=MEMO_ID';
          final result = extractRoutingFromURI(uri);
          expect(result.success, isTrue, reason: 'memo=$value');
          if (result is ExtractRoutingFromUriSuccess) {
            expect(result.rawParams.memo, value);
            expect(result.rawParams.memoType, 'MEMO_ID');
          }
        }
      });

      test('accepts secret seed, pre-auth, and hash signer destinations', () {
        const signers = <String>[
          'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          'TAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          'XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        ];
        for (final signer in signers) {
          final uri = 'web+stellar:pay?destination=$signer';
          final result = extractRoutingFromURI(uri);
          expect(result.success, isFalse, reason: 'signer=$signer');
          if (result is ExtractRoutingFromUriFailure) {
            expect(result.code, Sep7UriErrorCode.invalidDestination);
          }
        }
      });

      test('preserves multi-byte UTF-8 memo text', () {
        const memo = '\u00e9\u00e8\u00ea \u4f60\u597d \ud83d\ude00';
        final encoded = Uri.encodeComponent(memo);
        final uri =
            'web+stellar:pay?destination=$validG&memo=$encoded&memo_type=MEMO_TEXT';
        final result = extractRoutingFromURI(uri);
        expect(result.success, isTrue);
        if (result is ExtractRoutingFromUriSuccess) {
          expect(result.rawParams.memo, memo);
          expect(result.rawParams.memoType, 'MEMO_TEXT');
        }
      });

      test('rejects zero-width and bidi override characters in destination', () {
        const adversarial = <String>[
          '\u200b',
          '\u200c',
          '\u200d',
          '\u202a',
          '\u202b',
          '\u202c',
          '\u202d',
          '\u202e',
          '\u2066',
          '\u2067',
          '\u2068',
          '\u2069',
          '\ufeff',
        ];
        for (final hidden in adversarial) {
          final uri =
              'web+stellar:pay?destination=${Uri.encodeComponent('$validG$hidden')}';
          final result = extractRoutingFromURI(uri);
          expect(result.success, isFalse, reason: 'hidden=U+${hidden.codeUnitAt(0).toRadixString(16)}');
          if (result is ExtractRoutingFromUriFailure) {
            expect(result.code, Sep7UriErrorCode.invalidDestination);
          }
        }
      });

      test('rejects malformed SEP-0007 URIs', () {
        const malformed = <String>[
          'web+stellar:',
          'web+stellar:?',
          'web+stellar:pay?',
          'web+stellar:pay?destination',
          'web+stellar:pay?destination=',
          'web+stellar:pay?=value',
          'web+stellar:pay?destination=$validG&memo_type=INVALID',
          'web+stellar:pay?destination=$validG&memo_type=MEMO_ID&memo=notanumber',
          'web+stellar:pay?destination=$validG&amount=notanumber',
          'web+stellar:pay?destination=$validG&asset_code=USDC',
          'web+stellar:pay?destination=$validG&asset_issuer=GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S',
          'web+stellar:pay?destination=$validG&callback=notaurl',
        ];
        for (final uri in malformed) {
          final result = extractRoutingFromURI(uri);
          expect(result.success, isFalse, reason: 'uri=$uri');
        }
      });
    });
  });
}
