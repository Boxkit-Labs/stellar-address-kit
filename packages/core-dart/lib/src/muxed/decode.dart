import 'dart:typed_data';
import '../util/strkey.dart';
import 'decoded_muxed_address.dart';

class MuxedDecoder {
  static DecodedMuxedAddress decodeMuxedString(String mAddress) {
    final decoded = StrKeyUtil.decodeBase32(mAddress);
    // Payload starts at index 1 (skip version byte 0x60)
    // 32 bytes pubkey + 8 bytes ID = 40 bytes
    final pubkey = decoded.sublist(1, 33);
    final idBytes = decoded.sublist(33, 41);

    var id = BigInt.zero;
    for (final byte in idBytes) {
      id = (id << 8) + BigInt.from(byte);
    }

    // Encode pubkey back to G address
    final gData = Uint8List(33);
    gData[0] = 0x30; // Version G (48)
    gData.setAll(1, pubkey);
    final checksum = StrKeyUtil.calculateChecksum(gData);
    final finalGData = Uint8List(35);
    finalGData.setAll(0, gData);
    finalGData[33] = checksum & 0xFF;
    finalGData[34] = (checksum >> 8) & 0xFF;
    final baseG = StrKeyUtil.encodeBase32(finalGData);

    return DecodedMuxedAddress(baseG: baseG, id: id);
  }
}
