/// Compile-time platform probe for JavaScript-number semantics.
///
/// This library uses Dart's conditional-import mechanism ("conditional
/// compilation") to select, at compile time, whether the running build
/// targets JavaScript:
///
/// - **Flutter Web / dart2js / DDC** — resolves to [web_platform_web.dart],
///   where `isWebJsRuntime` is `true`.
/// - **VM / mobile / desktop / server** — resolves to [web_platform_io.dart],
///   where `isWebJsRuntime` is `false`.
///
/// Why this matters: when Dart is compiled to JavaScript, every `int` in the
/// program is backed by an IEEE-754 double (a JS `Number`). Integers above
/// `2^53 - 1` (`Number.MAX_SAFE_INTEGER` = `9007199254740991`) cannot be
/// represented exactly, so converting a 64-bit Stellar routing ID (a MEMO_ID
/// or muxed account ID) through `int`/`num` silently truncates it on web
/// builds. 64-bit routing IDs must instead be carried as `BigInt` or
/// canonical decimal strings — see [SafeRoutingId] for the wrapper this
/// package provides.
///
/// ```dart
/// import 'package:stellar_address_kit/stellar_address_kit.dart';
///
/// if (isWebJsRuntime) {
///   // Browser context: keep routing IDs as strings / BigInt.
///   final id = SafeRoutingId.parse('9007199254740993');
/// } else {
///   // Native: 64-bit ints are exact.
/// }
/// ```
library;

export 'web_platform_io.dart' if (dart.library.html) 'web_platform_web.dart';
