//! Stellar strkey address parsing.
//!
//! Implements the address classification and validation rules from the
//! stellar-address-kit specification:
//!
//! - `G…` Public key (Ed25519), 56 chars
//! - `M…` Muxed account (Ed25519 + 64-bit ID), 69 chars  
//! - `C…` Smart-contract address, 56 chars
//!
//! The parser validates:
//! 1. Non-empty input
//! 2. Recognised leading character (G / M / C)
//! 3. Correct total length for the kind
//! 4. Valid base-32 encoding (RFC 4648, uppercase, no padding)
//! 5. CRC-16/CCITT-FALSE checksum

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// The high-level kind of a Stellar address.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AddressKind {
    /// Public key (G-address)
    G,
    /// Muxed account (M-address)
    M,
    /// Smart contract (C-address)
    C,
}

/// A successfully parsed Stellar address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Address {
    kind: AddressKind,
    /// The normalised (uppercase) address string.
    raw: String,
    /// For M-addresses: the underlying G-address.
    base_g: Option<String>,
    /// For M-addresses: the 64-bit routing ID.
    muxed_id: Option<u64>,
}

impl Address {
    /// The address kind (G, M, or C).
    pub fn kind(&self) -> AddressKind {
        self.kind
    }

    /// The normalised address string.
    pub fn raw(&self) -> &str {
        &self.raw
    }

    /// The underlying G-address (only populated for M-addresses).
    pub fn base_g(&self) -> Option<&str> {
        self.base_g.as_deref()
    }

    /// The muxed routing ID (only populated for M-addresses).
    pub fn muxed_id(&self) -> Option<u64> {
        self.muxed_id
    }
}

/// Reasons a parse attempt can fail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// The input string is empty.
    EmptyInput,
    /// The leading character is not G, M, or C.
    UnknownPrefix { prefix: char },
    /// The address has the wrong number of characters for its kind.
    InvalidLength { expected: usize, actual: usize },
    /// A character outside the base-32 alphabet was found.
    InvalidBase32 { position: usize, ch: char },
    /// The CRC-16 checksum does not match.
    InvalidChecksum,
    /// The muxed-account payload could not be decoded.
    InvalidMuxedPayload,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyInput => write!(f, "empty input"),
            Self::UnknownPrefix { prefix } => write!(f, "unknown address prefix {prefix:?}"),
            Self::InvalidLength { expected, actual } => {
                write!(f, "invalid length: expected {expected}, got {actual}")
            }
            Self::InvalidBase32 { position, ch } => {
                write!(f, "invalid base-32 character {ch:?} at position {position}")
            }
            Self::InvalidChecksum => write!(f, "invalid checksum"),
            Self::InvalidMuxedPayload => write!(f, "invalid muxed-account payload"),
        }
    }
}

impl std::error::Error for ParseError {}

// ---------------------------------------------------------------------------
// Base-32 alphabet (RFC 4648, uppercase, no padding)
// ---------------------------------------------------------------------------

/// Maps a base-32 character to its 5-bit value, or returns `None`.
fn base32_value(ch: u8) -> Option<u8> {
    match ch {
        b'A'..=b'Z' => Some(ch - b'A'),
        b'2'..=b'7' => Some(ch - b'2' + 26),
        _ => None,
    }
}

/// Decode a base-32 string into bytes.
fn base32_decode(s: &str) -> Result<Vec<u8>, ParseError> {
    let s = s.as_bytes();
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;
    let mut output = Vec::with_capacity(s.len() * 5 / 8);

    for (i, &ch) in s.iter().enumerate() {
        let val = base32_value(ch).ok_or(ParseError::InvalidBase32 {
            position: i,
            ch: ch as char,
        })?;
        bits = (bits << 5) | (val as u32);
        bit_count += 5;
        if bit_count >= 8 {
            bit_count -= 8;
            output.push((bits >> bit_count) as u8);
            bits &= (1 << bit_count) - 1;
        }
    }
    Ok(output)
}

// ---------------------------------------------------------------------------
// CRC-16/CCITT-FALSE (polynomial 0x1021, init 0x0000)
// ---------------------------------------------------------------------------

fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0x0000;
    for &byte in data {
        let mut x = (crc >> 8) ^ (byte as u16);
        x ^= x >> 4;
        crc = (crc << 8) ^ (x << 12) ^ (x << 5) ^ x;
    }
    crc
}

// ---------------------------------------------------------------------------
// Strkey version bytes (matches the Stellar strkey spec)
// ---------------------------------------------------------------------------

const VERSION_G: u8 = 6 << 3; // 0x30 – Ed25519 public key
const VERSION_M: u8 = 12 << 3; // 0x60 – Muxed account
const VERSION_C: u8 = 2 << 3; // 0x10 – Contract

// Expected lengths (number of base-32 characters) for each kind.
const LEN_G: usize = 56;
const LEN_M: usize = 69;
const LEN_C: usize = 56;

// ---------------------------------------------------------------------------
// Public parse function
// ---------------------------------------------------------------------------

/// Parse a Stellar address string.
///
/// Accepts G-, M-, and C-addresses in their strkey encoding.  The input is
/// normalised to uppercase before processing.
///
/// # Errors
/// Returns a [`ParseError`] for any invalid input.  This function **never
/// panics** – the fuzzer relies on that guarantee.
pub fn parse(input: &str) -> Result<Address, ParseError> {
    if input.is_empty() {
        return Err(ParseError::EmptyInput);
    }

    let upper = input.to_uppercase();
    let first = upper.chars().next().unwrap();

    let (kind, expected_len) = match first {
        'G' => (AddressKind::G, LEN_G),
        'M' => (AddressKind::M, LEN_M),
        'C' => (AddressKind::C, LEN_C),
        _ => return Err(ParseError::UnknownPrefix { prefix: first }),
    };

    let actual_len = upper.chars().count();
    if actual_len != expected_len {
        return Err(ParseError::InvalidLength {
            expected: expected_len,
            actual: actual_len,
        });
    }

    // Decode base-32.
    let decoded = base32_decode(&upper)?;

    // Verify checksum: last 2 bytes are CRC-16 of everything before them.
    if decoded.len() < 3 {
        return Err(ParseError::InvalidChecksum);
    }
    let payload = &decoded[..decoded.len() - 2];
    let checksum_bytes = &decoded[decoded.len() - 2..];
    let stored_crc = u16::from_le_bytes([checksum_bytes[0], checksum_bytes[1]]);
    let computed_crc = crc16(payload);
    if stored_crc != computed_crc {
        return Err(ParseError::InvalidChecksum);
    }

    // Verify version byte.
    let expected_version = match kind {
        AddressKind::G => VERSION_G,
        AddressKind::M => VERSION_M,
        AddressKind::C => VERSION_C,
    };
    if payload.is_empty() || payload[0] != expected_version {
        return Err(ParseError::InvalidChecksum);
    }

    // For M-addresses, decode the muxed-account structure:
    //   1 byte  version
    //   8 bytes muxed ID (big-endian u64)
    //  32 bytes underlying Ed25519 public key
    //   2 bytes CRC
    // total payload (without version+CRC) = 40 bytes → 5 bits padding → 69 chars
    if kind == AddressKind::M {
        if payload.len() < 41 {
            return Err(ParseError::InvalidMuxedPayload);
        }
        let id_bytes: [u8; 8] = payload[1..9]
            .try_into()
            .map_err(|_| ParseError::InvalidMuxedPayload)?;
        let muxed_id = u64::from_be_bytes(id_bytes);

        // Reconstruct the base G-address from the embedded 32-byte key.
        let g_key_bytes = &payload[9..41];
        let base_g = encode_g_address(g_key_bytes)?;

        return Ok(Address {
            kind,
            raw: upper,
            base_g: Some(base_g),
            muxed_id: Some(muxed_id),
        });
    }

    Ok(Address {
        kind,
        raw: upper,
        base_g: None,
        muxed_id: None,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Encode 32 raw Ed25519 key bytes back into a G-address strkey.
fn encode_g_address(key: &[u8]) -> Result<String, ParseError> {
    if key.len() != 32 {
        return Err(ParseError::InvalidMuxedPayload);
    }
    // Payload: version byte + 32 key bytes
    let mut payload = vec![VERSION_G];
    payload.extend_from_slice(key);
    let crc = crc16(&payload);
    payload.push((crc & 0xFF) as u8);
    payload.push((crc >> 8) as u8);

    // Base-32 encode
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut result = String::with_capacity(56);
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;
    for &byte in &payload {
        bits = (bits << 8) | (byte as u32);
        bit_count += 8;
        while bit_count >= 5 {
            bit_count -= 5;
            result.push(ALPHABET[(bits >> bit_count) as usize & 0x1F] as char);
        }
    }
    if bit_count > 0 {
        result.push(ALPHABET[((bits << (5 - bit_count)) & 0x1F) as usize] as char);
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_error() {
        assert_eq!(parse("").unwrap_err(), ParseError::EmptyInput);
    }

    #[test]
    fn unknown_prefix_returns_error() {
        assert!(matches!(
            parse("XNOTASTELLARADDR"),
            Err(ParseError::UnknownPrefix { .. })
        ));
    }

    #[test]
    fn wrong_length_g_address() {
        // Valid base-32, valid prefix, but only 30 chars
        let short = "GABCDEF2345678ABCDEF2345678ABC";
        assert!(matches!(
            parse(short),
            Err(ParseError::InvalidLength { expected: 56, .. })
        ));
    }

    #[test]
    fn invalid_base32_character() {
        // Insert a '0' which is not in the strkey alphabet
        let bad = "G0HJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3PR5T4Q";
        assert!(matches!(
            parse(bad),
            Err(ParseError::InvalidBase32 { .. })
        ));
    }

    #[test]
    fn valid_g_address_parses() {
        // Known-good G-address from the STA test vectors
        let addr = "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3PR5T4Q";
        let result = parse(addr);
        assert!(result.is_ok(), "unexpected error: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.kind(), AddressKind::G);
        assert_eq!(parsed.base_g(), None);
        assert_eq!(parsed.muxed_id(), None);
    }

    #[test]
    fn lowercase_normalised_correctly() {
        let lower = "gahjjjkmokye4rvpzewztkh5fvi4pa3vl7gk2lfnubsgbv3pr5t4q";
        let upper = "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3PR5T4Q";
        // Both should produce the same result (or the same error code)
        let r_lower = parse(lower);
        let r_upper = parse(upper);
        // Normalisation means both code paths agree.
        assert_eq!(r_lower.is_ok(), r_upper.is_ok());
    }

    #[test]
    fn parse_does_not_panic_on_arbitrary_bytes() {
        // Stress test: ensure no panic for a range of degenerate inputs.
        let cases = [
            "",
            " ",
            "G",
            "M",
            "C",
            "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
            "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
            &"A".repeat(200),
            "\x00\x01\x02",
        ];
        for case in cases {
            let _ = parse(case); // must not panic
        }
    }
}
