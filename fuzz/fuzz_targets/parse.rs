#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Only valid UTF-8 can reach the parser; non-UTF-8 is out of scope.
    if let Ok(s) = core::str::from_utf8(data) {
        // Intentionally ignore Err: any parse error is expected input
        // rejection, not a fuzzer finding. Never unwrap/panic here.
        let _ = prism_core::address::parse(s);
    }
});
