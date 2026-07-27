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
        let result = parse("GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI");
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
