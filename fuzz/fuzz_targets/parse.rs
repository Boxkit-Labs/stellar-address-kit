#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Convert raw bytes to a string; invalid UTF-8 is still valuable fuzz input
    if let Ok(input) = std::str::from_utf8(data) {
        // The parser must never panic on any input
        let _ = prism_core::address::parse(input);
    }
});
