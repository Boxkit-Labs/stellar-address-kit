import 'package:meta/meta.dart';
import '../address/codes.dart';
import '../muxed/decode.dart';
import '../address/detect.dart';
import '../exceptions.dart';

/// An immutable representation of a Stellar Address.
@immutable
class StellarAddress {
  /// The specific kind of address (g, m, or c).
  final AddressKind kind;

  /// The original, encoded string representation of the address.
  final String raw;

  /// The base G... address associated with this address.
  /// For G-addresses, it matches [raw]. For M-addresses, it is the underlying account.
  final String? baseG;

  /// The 64-bit unsigned integer ID. Only present for M-addresses (muxedId).
  final BigInt? muxedId;

  /// Private internal constructor to enforce immutability.
  const StellarAddress._({
    required this.kind,
    required this.raw,
    this.baseG,
    this.muxedId,
  });

  /// Factory constructor that parses a Stellar address string.
  ///
  /// Throws [StellarAddressException] for invalid input or length.
  factory StellarAddress.parse(String address) {
    final kind = detect(address);
    if (kind == null) throw const StellarAddressException('Invalid address');

    switch (kind) {
      case AddressKind.g:
        return StellarAddress._(
            kind: AddressKind.g, raw: address, baseG: address);
      case AddressKind.m:
        try {
          final decoded = MuxedDecoder.decodeMuxedString(address);
          return StellarAddress._(
            kind: AddressKind.m,
            raw: address,
            baseG: decoded['baseG'] as String?,
            muxedId: decoded['id'] as BigInt?,
          );
        } catch (error, stackTrace) {
          throw StellarAddressException(
              'Invalid muxed address: ${error.toString()}');
        }
      case AddressKind.c:
        return StellarAddress._(kind: AddressKind.c, raw: address);
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is StellarAddress &&
          runtimeType == other.runtimeType &&
          raw == other.raw;

  @override
  int get hashCode => raw.hashCode;

  @override
  String toString() => raw;
}
