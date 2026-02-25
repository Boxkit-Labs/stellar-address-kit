import 'dart:typed_data';
import '../address/detect.dart';
import '../address/codes.dart';
import '../exceptions.dart';
import '../util/strkey.dart';
import 'encode.dart';

/// Class for handling Stellar Muxed Addresses (M... addresses).
class MuxedAddress {
  /// Encodes a G address and a 64-bit ID into a Muxed address (M...).
  /// 
  /// The [id] parameter must be a [BigInt] to ensure 64-bit precision.
  /// Throws [StellarAddressException] if [baseG] is not a valid G address 
  /// or if [id] is out of the uint64 range.
  static String encode({required String baseG, required BigInt id}) {
    // Validate ID range (uint64)
    final uint64Max = BigInt.parse('18446744073709551615');
    if (id < BigInt.zero || id > uint64Max) {
      throw StellarAddressException('ID must be within uint64 range (0 to 18446744073709551615)');
    }

    // Validate baseG
    if (detect(baseG) != AddressKind.g) {
      throw StellarAddressException('Invalid base G address: $baseG');
    }

    return MuxedEncoder.encodeMuxed(_decodeG(baseG), id);
  }

  /// Internal helper to decode G-address suffix to 32-byte pubkey.
  static List<int> _decodeG(String g) {
    try {
      final decoded = StrKeyUtil.decodeBase32(g);
      if (decoded.length != 35) {
        throw StellarAddressException('Invalid G address length');
      }
      if (decoded[0] != 0x30) {
        throw StellarAddressException('Address is not a G address');
      }

      final data = decoded.sublist(0, 33);
      final checksum = decoded.sublist(33, 35);
      final calculated = StrKeyUtil.calculateChecksum(Uint8List.fromList(data));

      if (checksum[0] != (calculated & 0xFF) ||
          checksum[1] != ((calculated >> 8) & 0xFF)) {
        throw StellarAddressException('Invalid checksum for G address');
      }

      return decoded.sublist(1, 33);
    } catch (e) {
      if (e is StellarAddressException) rethrow;
      throw StellarAddressException(
          'Failed to decode G address: ${e.toString()}');
    }
  }
}
