# Flutter Web BigInt Caveats

When Dart is compiled to JavaScript for Flutter web, JavaScript number
semantics apply at the interop boundary. That matters for Stellar muxed account
IDs because muxed IDs are unsigned 64-bit integers and values above `2^53 - 1`
cannot be represented safely as a JavaScript `Number`.

## Guidance

- Keep muxed IDs as Dart `BigInt` values for as long as possible.
- Do not coerce muxed IDs into JavaScript `Number` values on web targets.
- If you need to serialize or transmit a muxed ID in a web flow, prefer a
  string representation and convert back to `BigInt` explicitly.

## Why It Matters

Precision loss in a muxed ID can route funds or metadata to the wrong account
context. Treat muxed IDs as exact integers, not floating-point-compatible
numbers.

## The Built-In Safety Net (v1.1.0+)

Since v1.1.0 the package ships a dedicated web-safe layer, so you do not have
to hand-roll these guards:

### `isWebJsRuntime` — conditional compilation probe

```dart
import 'package:stellar_address_kit/stellar_address_kit.dart';

if (isWebJsRuntime) {
  // Compiled to JavaScript: Dart `int` is a JS `Number` here.
}
```

The flag is resolved at compile time via conditional imports
(`dart.library.html`), not by a runtime check — there is no
`dart:io`/`dart:html` dependency in your app.

### `SafeRoutingId` — the BigInt wrapper

`SafeRoutingId` parses, validates, compares, and serializes 64-bit routing
IDs as exact decimal strings backed by `BigInt`. It never converts through
`int`/JS `Number`, so the full uint64 range survives on Flutter Web:

```dart
final id = SafeRoutingId.parse('9007199254740993'); // 2^53 + 1
id.value;          // '9007199254740993' — exact on web
id.toBigInt;       // exact BigInt
id.toJson();       // '9007199254740993' — safe for jsonEncode
id.isJsSafe;       // false — exceeds Number.MAX_SAFE_INTEGER
id.exceedsJsSafeRange; // true
```

`SafeRoutingId.fromInt` **refuses** values above `Number.MAX_SAFE_INTEGER`
when `isWebJsRuntime` is true instead of propagating an already-truncated
JS `Number` — parse from the original string with `SafeRoutingId.parse`.

### Web-safe accessors on `RoutingResult`

```dart
final result = extractRoutingSync(RoutingInput(
  destination: 'GAYCUYT…',
  memoType: 'id',
  memoValue: '9007199254740993',
));

result.id;       // BigInt — exact on every platform
result.idString; // '9007199254740993' — web-safe string form
result.safeId;   // SafeRoutingId wrapper
```

Internally, `extractRoutingSync` and the MEMO_ID / MEMO_TEXT normalizers
validate uint64 range on the decimal string itself (length and lexicographic
comparison), never via `int`, so browser builds cannot silently truncate
massive routing IDs during parsing.

## Web Test Vectors

The browser-only suite
`packages/core-dart/test/web_compat/routing_id_web_test.dart` pins the
boundary IDs `2^53 - 1`, `2^53`, `2^53 + 1`, `2^63 - 1`, `2^63`, and
`2^64 - 1` (plus `0` and `1`) through memo extraction, muxed encode/decode,
and JSON serialization, including the canary proving that `int.parse`
truncates `9007199254740993` → `9007199254740992` in a browser while
`SafeRoutingId` keeps it exact. Run it with:

```bash
cd packages/core-dart
dart test test/web_compat --platform chrome
```
