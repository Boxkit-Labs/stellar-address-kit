import 'codes.dart';
import '../util/strkey.dart';
import 'dart:typed_data';

AddressKind? detect(String address) {
  if (address.isEmpty) return null;

  final prefix = address[0].toUpperCase();
  if (prefix != 'G' && prefix != 'M' && prefix != 'C') return null;

  try {
    final decoded = StrKeyUtil.decodeBase32(address);
    if (decoded.length < 3) return null;

    final payload = decoded.sublist(0, decoded.length - 2);
    final checksum = decoded.sublist(decoded.length - 2);
    final calculated = StrKeyUtil.calculateChecksum(Uint8List.fromList(payload));

    if (checksum[0] != (calculated & 0xFF) ||
        checksum[1] != ((calculated >> 8) & 0xFF)) {
      return null;
    }

    // Enforce exact version and length for each kind.
    final versionByte = payload[0];
    switch (prefix) {
      case 'G':
        if (decoded.length != 35 || versionByte != 0x30) return null;
        return AddressKind.g;
      case 'M':
        if (decoded.length != 43 || versionByte != 0x60) return null;
        return AddressKind.m;
      case 'C':
        if (decoded.length != 35 || versionByte != 0x10) return null;
        return AddressKind.c;
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}
