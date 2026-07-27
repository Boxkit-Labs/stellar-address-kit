#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AddressKind {
    G,
    M,
    C,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Address {
    kind: AddressKind,
    raw: String,
    base_g: Option<String>,
    muxed_id: Option<u64>,
}

impl Address {
    pub fn kind(&self) -> AddressKind { self.kind }
    pub fn raw(&self) -> &str { &self.raw }
    pub fn base_g(&self) -> Option<&str> { self.base_g.as_deref() }
    pub fn muxed_id(&self) -> Option<u64> { self.muxed_id }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    EmptyInput,
    UnknownPrefix { prefix: char },
    InvalidLength { expected: usize, actual: usize },
    InvalidBase32 { position: usize, ch: char },
    InvalidChecksum,
    InvalidMuxedPayload,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyInput => write!(f, "empty input"),
            Self::UnknownPrefix { prefix } => write!(f, "unknown prefix {prefix:?}"),
            Self::InvalidLength { expected, actual } => write!(f, "invalid length: expected {expected}, got {actual}"),
            Self::InvalidBase32 { position, ch } => write!(f, "invalid base-32 char {ch:?} at {position}"),
            Self::InvalidChecksum => write!(f, "invalid checksum"),
            Self::InvalidMuxedPayload => write!(f, "invalid muxed payload"),
        }
    }
}

impl std::error::Error for ParseError {}

const VERSION_G: u8 = 6 << 3;
const VERSION_M: u8 = 12 << 3;
const VERSION_C: u8 = 2 << 3;

const LEN_G: usize = 56;
const LEN_M: usize = 69;
const LEN_C: usize = 56;

fn base32_value(ch: u8) -> Option<u8> {
    match ch {
        b'A'..=b'Z' => Some(ch - b'A'),
        b'2'..=b'7' => Some(ch - b'2' + 26),
        _ => None,
    }
}

fn base32_decode(s: &str) -> Result<Vec<u8>, ParseError> {
    let s = s.as_bytes();
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;
    let mut output = Vec::with_capacity(s.len() * 5 / 8);
    for (i, &ch) in s.iter().enumerate() {
        let val = base32_value(ch).ok_or(ParseError::InvalidBase32 { position: i, ch: ch as char })?;
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

fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0x0000;
    for &byte in data {
        let mut x = (crc >> 8) ^ (byte as u16);
        x ^= x >> 4;
        crc = (crc << 8) ^ (x << 12) ^ (x << 5) ^ x;
    }
    crc
}

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
        return Err(ParseError::InvalidLength { expected: expected_len, actual: actual_len });
    }

    let decoded = base32_decode(&upper)?;

    if decoded.len() < 3 {
        return Err(ParseError::InvalidChecksum);
    }
    let payload = &decoded[..decoded.len() - 2];
    let checksum_bytes = &decoded[decoded.len() - 2..];
    let stored_crc = u16::from_le_bytes([checksum_bytes[0], checksum_bytes[1]]);
    if stored_crc != crc16(payload) {
        return Err(ParseError::InvalidChecksum);
    }

    let expected_version = match kind {
        AddressKind::G => VERSION_G,
        AddressKind::M => VERSION_M,
        AddressKind::C => VERSION_C,
    };
    if payload.is_empty() || payload[0] != expected_version {
        return Err(ParseError::InvalidChecksum);
    }

    if kind == AddressKind::M {
        if payload.len() < 41 {
            return Err(ParseError::InvalidMuxedPayload);
        }
        let id_bytes: [u8; 8] = payload[1..9].try_into().map_err(|_| ParseError::InvalidMuxedPayload)?;
        let muxed_id = u64::from_be_bytes(id_bytes);
        let base_g = encode_g_address(&payload[9..41])?;
        return Ok(Address { kind, raw: upper, base_g: Some(base_g), muxed_id: Some(muxed_id) });
    }

    Ok(Address { kind, raw: upper, base_g: None, muxed_id: None })
}

fn encode_g_address(key: &[u8]) -> Result<String, ParseError> {
    if key.len() != 32 {
        return Err(ParseError::InvalidMuxedPayload);
    }
    let mut payload = vec![VERSION_G];
    payload.extend_from_slice(key);
    let crc = crc16(&payload);
    payload.push((crc & 0xFF) as u8);
    payload.push((crc >> 8) as u8);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_error() {
        assert_eq!(parse("").unwrap_err(), ParseError::EmptyInput);
    }

    #[test]
    fn unknown_prefix_returns_error() {
        assert!(matches!(parse("XNOTASTELLARADDR"), Err(ParseError::UnknownPrefix { .. })));
    }

    #[test]
    fn wrong_length_g_address() {
        assert!(matches!(
            parse("GABCDEF2345678ABCDEF2345678ABC"),
            Err(ParseError::InvalidLength { expected: 56, .. })
        ));
    }

    #[test]
    fn invalid_base32_character() {
        // 56-char address with invalid base32 char '1' (0 and 1 are not valid base32)
        assert!(matches!(
            parse("GA1CUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"),
            Err(ParseError::InvalidBase32 { .. })
        ));
    }

    #[test]
    fn valid_g_address_parses() {
        let result = parse("GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI");
        assert!(result.is_ok());
        let parsed = result.unwrap();
        assert_eq!(parsed.kind(), AddressKind::G);
        assert_eq!(parsed.base_g(), None);
        assert_eq!(parsed.muxed_id(), None);
    }

    #[test]
    fn lowercase_normalised_correctly() {
        let r_lower = parse("gaycuyt553c5lhve2xpw5gmejt4bxgm7ahmjwlapzp53kjo7eiqadrsi");
        let r_upper = parse("GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI");
        assert_eq!(r_lower.is_ok(), r_upper.is_ok());
    }

    #[test]
    fn parse_does_not_panic_on_arbitrary_bytes() {
        for case in ["", " ", "G", "M", "C",
            "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
            "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
            &"A".repeat(200), "\x00\x01\x02"] {
            let _ = parse(case);
        }
    }
}
