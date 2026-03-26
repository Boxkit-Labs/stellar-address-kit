import 'package:stellar_address_kit/stellar_address_kit.dart';
import '../lib/src/util/strkey.dart';
import 'dart:typed_data';

void main() {
  const m =
      'MAAAAAAAAAAAAAB7BQ2L7E5NBWMXDUCMZSIPOBKRDSBYVLMXGSSKF6YNPIB7Y77ITKNOG';
  try {
    final decoded = StrKeyUtil.decodeBase32(m);
    print('Decoded length: ${decoded.length}');
    final data = decoded.sublist(0, decoded.length - 2);
    final checksum =
        decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
    final calculated = StrKeyUtil.calculateChecksum(data);
    print('Checksum: $checksum, Calculated: $calculated');
  } catch (e) {
    print('Error: $e');
  }
}
