import '../address/detect.dart';
import '../address/codes.dart';
import '../exceptions.dart';
import '../util/strkey.dart';
import 'decode.dart';
import 'decoded_muxed_address.dart';
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
/// apply appropriate conversion logic to maintain full 64-bit range
/// correctness. The [SafeRoutingId] wrapper does exactly this: it parses,
/// validates, and serializes routing IDs as exact decimal strings (see also
/// `isWebJsRuntime` for the compile-time web probe).
///
/// For Flutter web guidance and BigInt caveats, see
/// [flutter-web-bigint.md](../../../../docs/guides/flutter-web-bigint.md).
class MuxedAddress {
  static String encode({required String baseG, required BigInt id}) {
    return encodeWithMetadata(baseG: baseG, id: id).result;
  }

  /// Encodes a muxed address and returns normalization metadata.
  ///
  /// If the input required trimming or uppercasing, the result will
  /// include a `NON_CANONICAL_ADDRESS` warning and the normalized base G-address.
  static MuxedEncodeResult encodeWithMetadata({
    required String baseG,
    required BigInt id,
  }) {
    final uint64Max = BigInt.parse('18446744073709551615');
    if (id < BigInt.zero || id > uint64Max) {
      throw const StellarAddressException('ID out of uint64 range');
    }

    final normalized = baseG.trim().toUpperCase();
    final normalized = normalizedBaseG;
    final wasNormalized = normalized != baseG;

    if (detect(normalized) != AddressKind.g) {
      throw const StellarAddressException('Invalid base G address');
    }

    final result = MuxedEncoder.encodeMuxed(_decodeG(normalized), id);
    return MuxedEncodeResult(
      result: result,
      normalizedBaseG: wasNormalized ? normalized : null,
      warnings: wasNormalized
          ? const [MuxedNormalizationWarning.nonCanonicalAddress]
          : const [],
    );
  }

  static DecodedMuxedAddress decode(String mAddress) {
    try {
      return MuxedDecoder.decodeMuxedString(mAddress);
    } catch (e) {
      if (e is StellarAddressException) rethrow;
      throw StellarAddressException('Failed to decode M address: $e');
    }
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

/// Warning emitted when a muxed encode input was normalized.
enum MuxedNormalizationWarning {
  /// The base G-address had leading/trailing whitespace or non-uppercase
  /// Base32 characters and was normalized before encoding.
  nonCanonicalAddress,
}

/// Structured result of a muxed encode operation.
class MuxedEncodeResult {
  const MuxedEncodeResult({
    required this.result,
    this.normalizedBaseG,
    this.warnings = const [],
  });

  /// The encoded M-address.
  final String result;

  /// The normalized base G-address, or `null` if no normalization occurred.
  final String? normalizedBaseG;

  /// Warnings emitted during encoding.
  final List<MuxedNormalizationWarning> warnings;

  /// Whether the input required normalization.
  bool get wasNormalized => normalizedBaseG != null;

  /// Whether a `NON_CANONICAL_ADDRESS` warning was emitted.
  bool get hasNonCanonicalAddressWarning =>
      warnings.contains(MuxedNormalizationWarning.nonCanonicalAddress);
}
