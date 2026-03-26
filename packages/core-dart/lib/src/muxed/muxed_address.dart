import '../address/detect.dart';
import '../address/codes.dart';
import '../exceptions.dart';
import '../util/strkey.dart';
import 'encode.dart';

/// Class for handling Stellar Muxed Addresses (M... addresses).
///
/// IMPORTANT: On web targets, Dart compiled to JavaScript uses JS `Number` for
/// integer values, which cannot safely represent all 64-bit values above
/// `2^53 - 1`. In this library, `MuxedAddress` uses Dart `BigInt` for the
/// muxed ID; web consumers should avoid converting the 64-bit `id` to a JS
/// `Number`, or explicitly keep it as `BigInt` to prevent precision loss.
///
/// If you need to serialize IDs for web usage, treat them as strings and
/// apply appropriate conversion logic to maintain full 64-bit range correctness.
class MuxedAddress {
  static String encode({required String baseG, required BigInt id}) {
    final uint64Max = BigInt.parse('18446744073709551615');
    if (id < BigInt.zero || id > uint64Max) {
      throw const StellarAddressException('ID out of uint64 range');
    }

    if (detect(baseG) != AddressKind.g) {
      throw const StellarAddressException('Invalid base G address');
    }

    return MuxedEncoder.encodeMuxed(_decodeG(baseG), id);
  }

  static List<int> _decodeG(String g) {
    try {
      final decoded = StrKeyUtil.decodeBase32(g);
      return decoded.sublist(1, 33);
    } catch (e) {
      throw const StellarAddressException('Failed to decode G address');
    }
  }
}
