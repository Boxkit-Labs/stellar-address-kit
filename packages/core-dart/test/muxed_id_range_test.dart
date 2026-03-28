/// Bug Condition Exploration Test — Property 1: Fault Condition
///
/// Validates: Requirements 1.1, 1.2
///
/// This test MUST FAIL on unfixed code (i.e., when MuxedAddress.encode has no
/// uint64 range guard). Failure confirms the missing guard bug exists.
///
/// Expected counterexamples on unfixed code:
///   - encode(validG, BigInt.from(-1))                    → returns a String instead of throwing
///   - encode(validG, BigInt.parse('18446744073709551616')) → returns a String instead of throwing
///   - encode(validG, BigInt.parse('-9999999999999999999')) → returns a String instead of throwing
///   - encode(validG, uint64Max + BigInt.one)              → returns a String instead of throwing
///
/// Preservation Property Tests — Property 2: Valid ID Encoding Unchanged
///
/// Validates: Requirements 3.1, 3.2, 3.3, 3.4
///
/// These tests MUST PASS on both unfixed and fixed code — they capture the
/// baseline behavior that the fix must not regress.

import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  // Valid Stellar G-address taken from muxed_test.dart
  const validG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';

  final uint64Max = BigInt.parse('18446744073709551615');

  group('MuxedAddress.encode — out-of-range id (bug condition exploration)', () {
    /// Validates: Requirements 1.1, 1.2
    test('throws StellarAddressException for id = -1 (negative)', () {
      expect(
        () => MuxedAddress.encode(baseG: validG, id: BigInt.from(-1)),
        throwsA(isA<StellarAddressException>()),
        reason: 'encode(validG, -1) should throw but returns a String on unfixed code',
      );
    });

    /// Validates: Requirements 1.2
    test('throws StellarAddressException for id = 2^64 (one above uint64Max)', () {
      expect(
        () => MuxedAddress.encode(
          baseG: validG,
          id: BigInt.parse('18446744073709551616'),
        ),
        throwsA(isA<StellarAddressException>()),
        reason:
            'encode(validG, 18446744073709551616) should throw but returns a String on unfixed code',
      );
    });

    /// Validates: Requirements 1.1
    test('throws StellarAddressException for id = -9999999999999999999 (large negative)', () {
      expect(
        () => MuxedAddress.encode(
          baseG: validG,
          id: BigInt.parse('-9999999999999999999'),
        ),
        throwsA(isA<StellarAddressException>()),
        reason:
            'encode(validG, -9999999999999999999) should throw but returns a String on unfixed code',
      );
    });

    /// Validates: Requirements 1.2
    test('throws StellarAddressException for id = uint64Max + 1', () {
      expect(
        () => MuxedAddress.encode(baseG: validG, id: uint64Max + BigInt.one),
        throwsA(isA<StellarAddressException>()),
        reason:
            'encode(validG, uint64Max + 1) should throw but returns a String on unfixed code',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2: Preservation — Valid ID Encoding Unchanged
  //
  // Validates: Requirements 3.1, 3.2, 3.3, 3.4
  //
  // For all ids in [0, 2^64−1] with a valid baseG, encode must produce a valid
  // M-address (non-empty string starting with 'M').
  // For an invalid baseG, encode must throw StellarAddressException regardless
  // of the id value.
  //
  // These tests MUST PASS on both unfixed and fixed code.
  // ---------------------------------------------------------------------------
  group('MuxedAddress.encode — preservation of valid-id behavior', () {
    // Representative valid ids covering lower boundary, upper boundary, and
    // several mid-range values.
    final validIds = <BigInt>[
      BigInt.zero,                                    // lower boundary (req 3.1)
      BigInt.one,                                     // just above zero
      BigInt.from(1000),                              // small mid-range
      BigInt.parse('9223372036854775807'),             // int64 max (mid-range)
      BigInt.parse('9223372036854775808'),             // int64 max + 1
      BigInt.parse('12345678901234567890'),            // large mid-range
      uint64Max - BigInt.one,                         // one below upper boundary
      uint64Max,                                      // upper boundary (req 3.3)
    ];

    /// Validates: Requirements 3.1, 3.2, 3.3
    for (final id in validIds) {
      test('encode(validG, $id) returns a valid M-address', () {
        final result = MuxedAddress.encode(baseG: validG, id: id);

        expect(result, isNotEmpty,
            reason: 'encode($id) must return a non-empty string');
        expect(result, startsWith('M'),
            reason: 'encode($id) must return an M-address (starts with M)');
      });
    }

    /// Validates: Requirement 3.4
    /// encode with an invalid baseG must throw StellarAddressException for the
    /// base address, regardless of the id value.
    test('encode(invalidG, validId) throws StellarAddressException for invalid base', () {
      const invalidG = 'INVALID_ADDRESS';
      expect(
        () => MuxedAddress.encode(baseG: invalidG, id: BigInt.from(42)),
        throwsA(isA<StellarAddressException>()),
        reason: 'encode with an invalid G-address must throw StellarAddressException',
      );
    });

    /// Validates: Requirement 3.4 — also check with a well-formed but wrong-type address
    test('encode(M-address as baseG, validId) throws StellarAddressException', () {
      // An M-address is not a valid baseG
      const mAddress =
          'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672';
      expect(
        () => MuxedAddress.encode(baseG: mAddress, id: BigInt.zero),
        throwsA(isA<StellarAddressException>()),
        reason: 'encode with an M-address as baseG must throw StellarAddressException',
      );
    });
  });
}
