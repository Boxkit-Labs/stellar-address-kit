import 'dart:math';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

// Fixed valid G address used as the base for round-trip tests.
const _baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
const _iterations = 100;

/// Generates a random BigInt in [0, 2^64 - 1].
BigInt _randomUint64(Random rng) {
  // Build 64 random bits from two 32-bit values.
  final hi = BigInt.from(rng.nextInt(1 << 32));
  final lo = BigInt.from(rng.nextInt(1 << 32));
  return (hi << 32) | lo;
}

void main() {
  final rng = Random(42); // seeded for reproducibility

  // Feature: muxed-decode-typed-dto, Property 1: Construction preserves field values
  // For any baseG string and BigInt id, DecodedMuxedAddress(baseG, id).baseG == baseG and .id == id
  group('Property 1: Construction preserves field values', () {
    test('field values are preserved across $\_iterations random instances', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final dto = DecodedMuxedAddress(baseG: _baseG, id: id);
        expect(dto.baseG, equals(_baseG),
            reason: 'baseG mismatch at iteration $i');
        expect(dto.id, equals(id), reason: 'id mismatch at iteration $i');
      }
    });

    test('boundary values: id=0 and id=2^64-1', () {
      final minDto = DecodedMuxedAddress(baseG: _baseG, id: BigInt.zero);
      expect(minDto.id, equals(BigInt.zero));

      final maxId = BigInt.parse('18446744073709551615');
      final maxDto = DecodedMuxedAddress(baseG: _baseG, id: maxId);
      expect(maxDto.id, equals(maxId));
    });
  });

  // Feature: muxed-decode-typed-dto, Property 2: Equality and hashCode consistency
  // For any two DecodedMuxedAddress instances, == and hashCode are consistent with field equality
  group('Property 2: Equality and hashCode consistency', () {
    test('equal instances have equal hashCode across $\_iterations pairs', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final a = DecodedMuxedAddress(baseG: _baseG, id: id);
        final b = DecodedMuxedAddress(baseG: _baseG, id: id);
        expect(a, equals(b), reason: 'equality failed at iteration $i');
        expect(a.hashCode, equals(b.hashCode),
            reason: 'hashCode mismatch at iteration $i');
      }
    });

    test('instances with different id are not equal', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final a = DecodedMuxedAddress(baseG: _baseG, id: id);
        final b = DecodedMuxedAddress(baseG: _baseG, id: id + BigInt.one);
        expect(a, isNot(equals(b)),
            reason: 'should not be equal at iteration $i');
      }
    });
  });

  // Feature: muxed-decode-typed-dto, Property 3: toString contains both fields
  // For any DecodedMuxedAddress, toString() contains baseG and id
  group('Property 3: toString contains both fields', () {
    test('toString contains baseG and id across $\_iterations instances', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final dto = DecodedMuxedAddress(baseG: _baseG, id: id);
        final s = dto.toString();
        expect(s, contains(_baseG),
            reason: 'toString missing baseG at iteration $i');
        expect(s, contains(id.toString()),
            reason: 'toString missing id at iteration $i');
      }
    });
  });

  // Feature: muxed-decode-typed-dto, Property 4: Round-trip encode → decode → encode
  // For any valid baseG and uint64 id, encode then decode then re-encode is identity
  group('Property 4: Round-trip encode → decode → encode', () {
    test('round-trip preserves baseG and id across $\_iterations random ids',
        () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final mAddress = MuxedAddress.encode(baseG: _baseG, id: id);
        final decoded = MuxedAddress.decode(mAddress);
        expect(decoded.baseG, equals(_baseG),
            reason: 'baseG mismatch at iteration $i (id=$id)');
        expect(decoded.id, equals(id),
            reason: 'id mismatch at iteration $i (id=$id)');
        final reEncoded =
            MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id);
        expect(reEncoded, equals(mAddress),
            reason: 're-encode mismatch at iteration $i (id=$id)');
      }
    });

    test('boundary values: id=0, id=2^53, id=2^64-1', () {
      final boundaries = [
        BigInt.zero,
        BigInt.from(2).pow(53),
        BigInt.parse('18446744073709551615'),
      ];
      for (final id in boundaries) {
        final mAddress = MuxedAddress.encode(baseG: _baseG, id: id);
        final decoded = MuxedAddress.decode(mAddress);
        expect(decoded.baseG, equals(_baseG), reason: 'baseG mismatch id=$id');
        expect(decoded.id, equals(id), reason: 'id mismatch id=$id');
        expect(MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id),
            equals(mAddress),
            reason: 're-encode mismatch id=$id');
      }
    });
  });

  // Feature: muxed-decode-typed-dto, Property 5: Invalid input throws StellarAddressException
  // For any non-M-address string, MuxedAddress.decode throws StellarAddressException
  group('Property 5: Invalid input throws StellarAddressException', () {
    test('known invalid inputs throw StellarAddressException', () {
      final invalidInputs = [
        '',
        _baseG, // G address, not M
        'not-an-address',
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD6', // truncated
        'XAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI', // wrong prefix
      ];
      for (final input in invalidInputs) {
        expect(
          () => MuxedAddress.decode(input),
          throwsA(isA<StellarAddressException>()),
          reason: 'expected StellarAddressException for input: "$input"',
        );
      }
    });

    test('random garbage strings throw StellarAddressException', () {
      const chars =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (var i = 0; i < _iterations; i++) {
        final len = rng.nextInt(50) + 1;
        final s = List.generate(
            len, (_) => chars[rng.nextInt(chars.length)]).join();
        // Only test strings that don't start with M (to avoid accidental valid M addresses)
        if (s.startsWith('M')) continue;
        expect(
          () => MuxedAddress.decode(s),
          throwsA(isA<StellarAddressException>()),
          reason: 'expected StellarAddressException for random input: "$s"',
        );
      }
    });
  });
}
