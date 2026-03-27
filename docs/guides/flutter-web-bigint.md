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
