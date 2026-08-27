/// Browser (dart2js / DDC / Flutter Web) implementation of the web-runtime probe.
///
/// Selected via conditional import when the code is compiled to JavaScript.
/// On this target, every Dart `int` is backed by an IEEE-754 double — a
/// JavaScript `Number` — which can only represent integers exactly up to
/// `2^53 - 1` (`Number.MAX_SAFE_INTEGER`).
///
/// This file intentionally imports nothing: correctness of the probe relies
/// purely on which file the conditional import in `web_platform.dart`
/// resolves to at compile time ("conditional compilation").
library;

/// Always `true` when compiled to JavaScript.
bool get isWebJsRuntime => true;
