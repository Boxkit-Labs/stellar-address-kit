import 'package:stellar_address_kit/src/util/strkey.dart';
import 'dart:typed_data';

void main() {
  final addr = 'ga7qynf7szfx4x7x5jfzz3uq6bxhdsy2rkvkzkx5ffqj1zmzx1';
  final decoded = StrKeyUtil.decodeBase32(addr);
  print('Decoded length: ${decoded.length}');

  final data = decoded.sublist(0, decoded.length - 2);
  final checksum = decoded.sublist(decoded.length - 2);
  final calculated = StrKeyUtil.calculateChecksum(Uint8List.fromList(data));
  print('Checksum: ${checksum[0]} ${checksum[1]}');
  print('Calculated: ${calculated & 0xFF} ${(calculated >> 8) & 0xFF}');
}
