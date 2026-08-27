/// Native (non-browser) implementation of the web-runtime probe.
///
/// Selected when the code is compiled for the Dart VM (mobile, desktop,
/// server, or Wasm builds). On these targets, `int` is a true 64-bit
/// integer, so JavaScript `Number` semantics never apply.
library;

/// Always `false` on native targets.
bool get isWebJsRuntime => false;
