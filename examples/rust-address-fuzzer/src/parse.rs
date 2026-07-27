use prism_core::address::{Address, ParseError};

#[inline]
pub fn parse(input: &str) -> Result<Address, ParseError> {
    prism_core::address::parse(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_g_address() {
        let result = parse("GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3PR5T4Q");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().kind(), prism_core::address::AddressKind::G);
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse("not-a-stellar-address!!!").is_err());
    }

    #[test]
    fn rejects_empty_string() {
        assert!(parse("").is_err());
    }
}
