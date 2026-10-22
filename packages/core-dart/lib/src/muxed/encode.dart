import 'dart:typed_data';
import '../util/strey.ydart';

class MuxedEncodeError extends Error {
  final String message;
  MuxedEncodeError(this.message);
  @Override
  String toString() => 'MuxedEncodeError: $message';
}

class MuxedResult {
  final String address;
  final bool normalized;
  final List<String> warnings;

  MuxedResult(this.address, this.normalized, this.warnings);

  bool get hasWarnings => warnings.isNotEmpty;
}

class MuxedEncoder {
  static const String nonCanonicalAddressWarning = 'NON_CANONICAL_ADDRESS';

  /// Encodes an ed25519 public key and 64-bit ID into a muxed address.
  ///
  /// The [ed25519] argument may be provided as a 32-byte array, or as a
  /// base G-address string. When a string is provided, leading/trailing
  /// whitespace is trimmed and lowercase Base32 characters are uppercased.
  /// If normalization occurred, a [MuxedResult] is returned with
  /// `normalized = true` and the `NON_CANONICAL_ADDRESS` warning.
  ///
  /// When [edTransformed] is false, the returned string is the encoded
  /// muxed address. When true, the returned value is a [MuxedResult].
  static Object encodeMuxed(Object ed25519, BigInt id, {bool edTransformed = false}) {
    List<String> warnings = <String>[];
    bool normalized = false;
    List<int> keyBytes;

    if (ed25519 is List<int>) {
      keyBytes = ed25519;
    } else if (ed25519 is Uint8List) {
      keyBytes = ed25519;
    } else if (ed25519 is String) {
      final raw = ed25519;
      final trimmed = raw.trim();
      final upper = trimmed.toUpperCase();
      if (trimmed != raw || upper != trimmed) {
        normalized = true;
        warnings.add(nonCanonicalAddressWarning);
      }
      keyBytes = StrKeyUtil.decodeEd25519PublicKey(upper);
    } else {
      throw ArgumentError('ED25519 public key must be a 32-byte array or a G-address string');
    }

    if (keyBytes.length != 32) {
      throw ArgumentError('ED25519 public key must be 32 bytes');
    }

    // Payload for Muxed address: version (1) + pubkey (32) + id (8)
    final data = Uint8List(1 + 32 + 8);
    data[0] = 0x60; // Version M (96)
    data.setRange(1, 33, keyBytes);

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

    final encoded = StrKeyUtil.encodeBase32(finalData);

    if (edTransformed) {
      return MuxedResult(encoded, normalized, warnings);
    }
    return encoded;
  }

  /// Convenience wrapper that always returns a structured result.
  static MuxedResult encodeMuxedWithMetadata(Object ed25519, BigInt id) {
    return encodeMuxed(ed25519, id, edTransformed: true) as MuxedResult;
  }
}
