import 'dart:typed_data';

import 'codes.dart';
import '../util/strkey.dart';

/// Classifies a raw Stellar address string into one of the three Stellar
/// address kinds — classic (`G…`), muxed (`M…`), or contract (`C…`) —
/// without performing any deposit-routing logic.
///
/// This is a low-level structural primitive. Callers that need full
/// deposit-routing decisions (routing ID resolution, memo handling, warning
/// codes) should use `extractRouting` instead of calling [detect] directly.
///
/// ---
///
/// ## Address kinds
///
/// | Prefix | [AddressKind] | Description |
/// |--------|---------------|-------------|
/// | `G…`   | [AddressKind.g] | Classic 56-character Stellar account. Valid destination for classic `Payment` operations. Version byte `0x30`, decoded length 35 bytes. |
/// | `M…`   | [AddressKind.m] | Muxed account — a `G` address with a 64-bit integer ID embedded in a single StrKey string. Used for pooled-account deposit routing without a memo. Version byte `0x60`, decoded length 43 bytes. |
/// | `C…`   | [AddressKind.c] | Soroban smart-contract address. Valid StrKey **but not** a valid destination for classic `Payment` operations. The routing layer above this function surfaces contract destinations as `INVALID_DESTINATION`. Version byte `0x10`, decoded length 35 bytes. |
///
/// ---
///
/// ## Input contract
///
/// - [address] may be **any** [String]. [detect] is **contractually
///   non-throwing**: it catches all internal exceptions and returns `null`
///   instead of propagating them. This guarantee covers empty strings,
///   non-ASCII text, strings of any length, and any other arbitrary input.
/// - The prefix check is **case-insensitive**: both `'g…'` and `'G…'` are
///   recognised as a classic address prefix. The caller does not need to
///   normalise casing before calling [detect].
///
/// ---
///
/// ## Return value
///
/// Returns an [AddressKind] on **success**, or `null` on **any failure**.
///
/// `null` is returned for every one of the following conditions:
///
/// - [address] is empty.
/// - The first character is not `G`, `M`, or `C` (case-insensitive) —
///   **unknown prefix**. Prefix detection runs *before* Base32 decoding and
///   checksum verification, so `"NOTANADDRESS"` returns `null` due to an
///   unknown prefix, not a checksum error.
/// - Base32 decoding fails (malformed alphabet, padding error, etc.).
/// - The decoded byte sequence is shorter than 3 bytes.
/// - The CRC-16 checksum of the payload does not match the two trailing bytes
///   of the decoded data — **invalid checksum** (e.g. a tampered G-length
///   string).
/// - The version byte or decoded length does not match the expected values for
///   the detected prefix — **invalid length / version**.
/// - Any unexpected exception is thrown internally.
///
/// All failure modes collapse to the same `null` sentinel. Structured error
/// codes (`UNKNOWN_PREFIX`, `INVALID_CHECKSUM`, `INVALID_LENGTH`) are
/// surfaced by the routing layer that wraps [detect], not by [detect] itself.
///
/// ---
///
/// ## Spec invariants
///
/// The following invariants hold unconditionally and are validated by the
/// shared `spec/vectors.json` test suite run identically across all three
/// language implementations (TypeScript, Go, Dart):
///
/// - **Prefix fires first.** `UNKNOWN_PREFIX` (i.e. `null`) is returned
///   before any checksum or length check is attempted.
/// - **`C` is structurally valid.** A contract address that passes all
///   structural checks returns [AddressKind.c], not `null`. The
///   `INVALID_DESTINATION` routing error is applied by the layer above.
/// - **uint64 muxed IDs.** Muxed account IDs are unsigned 64-bit integers.
///   Any implementation that coerces them to a 64-bit signed integer or a
///   floating-point `double` will silently corrupt IDs above 2^53. The
///   mandatory 2^53 + 1 canary vector (`id: "9007199254740993"`) in the spec
///   suite catches this class of bug.
/// - **Output is canonical.** The [AddressKind] values are stable enum
///   members; consumers must not compare them by name string.
///
/// ---
///
/// ## Examples
///
/// ```dart
/// // Classic G address — returns AddressKind.g
/// final g = detect('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN');
/// assert(g == AddressKind.g);
///
/// // Muxed M address — returns AddressKind.m
/// final m = detect('MA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCAQV4JDPROD7DAQ');
/// assert(m == AddressKind.m);
///
/// // Contract C address — structurally valid, INVALID_DESTINATION only in routing
/// final c = detect('CA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBAQLCD');
/// assert(c == AddressKind.c);
///
/// // Empty input — returns null
/// assert(detect('') == null);
///
/// // Unknown prefix — returns null (prefix check fires before checksum)
/// assert(detect('NOTANADDRESS') == null);
///
/// // Lowercase input — prefix check is case-insensitive, still classifies correctly
/// final lower = detect('gaazi4tcr3ty5ojhctjc2a4qsy6cjwjh5iajtgkin2er7lbnvkoccwn');
/// assert(lower == AddressKind.g);
///
/// // Tampered checksum — returns null
/// assert(detect('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWX') == null);
/// ```
///
/// ---
///
/// ## Spec compliance
///
/// The behaviour of [detect] is fully specified in `spec/vectors.json` at the
/// repository root. All three language implementations produce identical
/// results for every vector in the suite. The spec is the source of truth —
/// if a vector passes in TypeScript, it passes identically in Go and Dart.
///
/// See also:
///
/// - [AddressKind] for the enumeration of the three Stellar address types.
/// - `extractRouting` for full deposit-routing logic built on top of [detect],
///   including memo handling, routing ID resolution, and structured warning
///   codes.
/// - `StrKeyUtil` for the Base32 decoding and CRC-16 checksum primitives used
///   internally by this function.
AddressKind? detect(String address) {
  if (address.isEmpty) return null;

  final prefix = address[0].toUpperCase();
  if (prefix != 'G' && prefix != 'M' && prefix != 'C') return null;

  try {
    final decoded = StrKeyUtil.decodeBase32(address);
    if (decoded.length < 3) return null;

    final payload = decoded.sublist(0, decoded.length - 2);
    final checksum = decoded.sublist(decoded.length - 2);
    final calculated =
        StrKeyUtil.calculateChecksum(Uint8List.fromList(payload));

    if (checksum[0] != (calculated & 0xFF) ||
        checksum[1] != ((calculated >> 8) & 0xFF)) {
      return null;
    }

    // Enforce exact version byte and decoded length for each address kind.
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