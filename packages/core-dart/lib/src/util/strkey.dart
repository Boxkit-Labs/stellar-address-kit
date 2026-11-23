import 'dart:typed_data';

class StrKeyUtil {
  static const String _alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  static Uint8List decodeBase32(String input) {
    input = input.toUpperCase().replaceAll('=', '');
    final charCount = input.length;
    final byteCount = (charCount * 5) ~/ 8;
    final result = Uint8List(byteCount);

    int buffer = 0;
    int bitsLeft = 0;
    int charIndex = 0;
    int byteIndex = 0;

    while (byteIndex < byteCount) {
      if (bitsLeft < 8) {
        if (charIndex < charCount) {
          final char = input[charIndex++];
          final value = _alphabet.indexOf(char);
          if (value == -1) throw FormatException('Invalid Base32 character: $char');
          buffer = (buffer << 5) | value;
          bitsLeft += 5;
        } else {
          break;
        }
      }

      if (bitsLeft >= 8) {
        result[byteIndex++] = (buffer >> (bitsLeft - 8)) & 0xFF;
        bitsLeft -= 8;
      }
    }

    return result;
  }

  /// Decodes a classic `G...` address into its 32-byte Ed25519 public key.
  ///
  /// Throws a [FormatException] when the address is not 35 bytes, does not
  /// carry the Ed25519 public key version byte, or fails its checksum.
  static Uint8List decodeEd25519PublicKey(String address) {
    // A G address is exactly 56 base32 characters; decodeBase32 would
    // silently ignore anything past the 35th byte, so check the text first.
    if (address.length != 56) {
      throw const FormatException('Invalid G address length');
    }
    final decoded = decodeBase32(address);
    if (decoded.length != 35) {
      throw const FormatException('Invalid G address length');
    }
    if (decoded[0] != 0x30) {
      throw const FormatException('Not an Ed25519 public key address');
    }
    final checksum = calculateChecksum(Uint8List.sublistView(decoded, 0, 33));
    if (decoded[33] != (checksum & 0xFF) ||
        decoded[34] != ((checksum >> 8) & 0xFF)) {
      throw const FormatException('Invalid G address checksum');
    }
    return Uint8List.fromList(decoded.sublist(1, 33));
  }

  static String encodeBase32(Uint8List data) {
    final result = StringBuffer();

    int buffer = 0;
    int bitsLeft = 0;
    
    for (var byte in data) {
      buffer = (buffer << 8) | byte;
      bitsLeft += 8;
      while (bitsLeft >= 5) {
        result.write(_alphabet[(buffer >> (bitsLeft - 5)) & 0x1F]);
        bitsLeft -= 5;
      }
    }

    if (bitsLeft > 0) {
      result.write(_alphabet[(buffer << (5 - bitsLeft)) & 0x1F]);
    }

    return result.toString();
  }

  static int calculateChecksum(Uint8List bytes) {
    int crc = 0x0000;
    for (int byte in bytes) {
      crc ^= (byte << 8);
      for (int i = 0; i < 8; i++) {
        if ((crc & 0x8000) != 0) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = (crc << 1);
        }
      }
    }
    // Return little-endian CRC bytes
    return crc & 0xFFFF;
  }
}
