//! parse.rs – thin wrapper around the prism-core parser.
//!
//! This module is the single seam between the fuzzer harness and the real
//! address parser.  Keeping it thin means the fuzzer hits the same code path
//! that ships in production; there is no mock or stub.
//!
//! # Re-exports
//! [`Address`] and [`ParseError`] are re-exported so callers only import from
//! this module rather than depending on prism-core directly.

pub use prism_core::address::Address;
pub use prism_core::address::ParseError;

/// Parse a Stellar address string using the prism-core parser.
///
/// Returns `Ok(Address)` for a syntactically valid G-, M-, or C-address.
/// Returns `Err(ParseError)` for any invalid input, including bad checksums,
/// wrong length, or unknown prefixes.
///
/// # Panics
/// This function **must not panic** under any input.  Any panic is a bug in
/// prism-core and should be reported as a defect.
#[inline]
pub fn parse(input: &str) -> Result<Address, ParseError> {
    prism_core::address::parse(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sanity-check that a known-good G-address parses without error.
    #[test]
    fn parses_valid_g_address() {
        let addr = "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3PR5T4Q";
        let result = parse(addr);
        assert!(result.is_ok(), "expected Ok for a valid G-address, got {result:?}");
        let parsed = result.unwrap();
        assert_eq!(parsed.kind(), prism_core::address::AddressKind::G);
    }

    /// Sanity-check that garbage input returns an Err, not a panic.
    #[test]
    fn rejects_garbage() {
        let result = parse("not-a-stellar-address!!!");
        assert!(result.is_err(), "expected Err for garbage input");
    }

    /// Sanity-check that an empty string returns an Err.
    #[test]
    fn rejects_empty_string() {
        assert!(parse("").is_err());
    }
}
