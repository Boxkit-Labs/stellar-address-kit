import 'dart:typed_data';
import '../util/strkey.dart';

class MuxedEncoder {
  static String encodeMuxed(List<int> ed25519, BigInt id) {
    if (ed25519.length != 32) {
      throw ArgumentError('ED25519 public key must be 32 bytes');
    }

    // Payload for Muxed address: version (1) + pubkey (32) + id (8)
    final data = Uint8List(1 + 32 + 8);
    data[0] = 0x60; // Version M (96)
    data.setRange(1, 33, ed25519);

    // Encode ID as 64-bit big-endian
    var remainingId = id;
    for (var i = 7; i >= 0; i--) {
      data[33 + i] = (remainingId & BigInt.from(0xFF)).toInt();
      remainingId >>= 8;
    }

    // Calculate checksum of version + data
    final checksum = StrKeyUtil.calculateChecksum(data);

    // Total encoded data: data + 2-byte checksum (little-endian)
    final finalData = Uint8List(data.length + 2);
    finalData.setAll(0, data);
    finalData[data.length] = checksum & 0xFF;
    finalData[data.length + 1] = (checksum >> 8) & 0xFF;

    return StrKeyUtil.encodeBase32(finalData);
  }
}
