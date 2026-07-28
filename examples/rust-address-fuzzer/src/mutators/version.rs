//! Version-byte swap mutator for Stellar StrKey addresses.
//!
//! The leading version byte is the only field that distinguishes address types:
//!   G (account)   → VERSION_G = 6<<3  = 48  → base-32 first char 'G'
//!   M (muxed)     → VERSION_M = 12<<3 = 96  → base-32 first char 'M'
//!   C (contract)  → VERSION_C = 2<<3  = 16  → base-32 first char 'C'
//!   seed (secret) → VERSION_S = 18<<3 = 144 → base-32 first char 'S'
//!
//! Because the parser dispatches on the *leading base-32 character* before
//! inspecting the decoded version byte, a swap MUST produce one of:
//!   - `InvalidChecksum`  (version byte changed → CRC mismatch; same leading char)
//!   - `UnknownPrefix`    (if the new leading char is outside G/M/C)
//!   - `InvalidLength`    (if re-encoded length doesn't match the new prefix's expectation)
//!   - correct re-parse   (only when the new version byte encodes to the same leading char
//!                         AND produces a valid CRC AND the new kind matches)
//!
//! A *misclassification* is any outcome where the parser returns `Ok` with a
//! different `AddressKind` than what the freshly-encoded string claims.
//! That must never happen silently.

use rand::Rng;

use prism_core::address::{parse, AddressKind, ParseError};

// ── Well-known version bytes ──────────────────────────────────────────────────

/// Every strkey version byte recognised by the Stellar protocol.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KnownVersion {
    /// Public key (G-address): 6<<3 = 48
    Account,
    /// Muxed account (M-address): 12<<3 = 96
    Muxed,
    /// Contract (C-address): 2<<3 = 16
    Contract,
    /// Secret seed (S-address): 18<<3 = 144  — included so the fuzzer can
    /// verify the parser *rejects* seeds fed as public-key addresses.
    Seed,
}

impl KnownVersion {
    pub const fn byte(self) -> u8 {
        match self {
            Self::Account  => 6  << 3,   //  48
            Self::Muxed    => 12 << 3,   //  96
            Self::Contract => 2  << 3,   //  16
            Self::Seed     => 18 << 3,   // 144
        }
    }

    /// All known version bytes, in a fixed order so tests are deterministic.
    pub const ALL: [KnownVersion; 4] = [
        KnownVersion::Account,
        KnownVersion::Muxed,
        KnownVersion::Contract,
        KnownVersion::Seed,
    ];
}

// ── Sub-case classification ───────────────────────────────────────────────────

/// The kind of version byte injected by `swap_version_byte`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InjectedVersion {
    /// The replacement is one of the four protocol-defined version bytes.
    Known(KnownVersion),
    /// The replacement is *not* any protocol-defined byte (garbage byte).
    Invalid(u8),
}

impl InjectedVersion {
    pub fn byte(self) -> u8 {
        match self {
            Self::Known(kv) => kv.byte(),
            Self::Invalid(b) => b,
        }
    }

    pub fn is_invalid(self) -> bool {
        matches!(self, Self::Invalid(_))
    }
}

// ── Outcome of one swap attempt ───────────────────────────────────────────────

/// Result of calling `swap_version_byte` on one address.
#[derive(Debug)]
pub struct SwapResult {
    /// The original input address.
    pub original: String,
    /// The kind reported by parsing the original (for logging/assertions).
    pub original_kind: AddressKind,
    /// The version byte injected (sub-case).
    pub injected: InjectedVersion,
    /// The re-encoded string that was handed to the parser.
    pub mutated: String,
    /// What the parser said.
    pub outcome: Result<AddressKind, ParseError>,
}

impl SwapResult {
    /// Returns `true` if this swap constitutes a **silent misclassification**:
    /// the parser accepted the mutated address but reported a kind that does
    /// not match the leading character of the re-encoded string.
    pub fn is_misclassification(&self) -> bool {
        if let Ok(reported_kind) = self.outcome {
            let leading = self.mutated.chars().next().unwrap_or('\0');
            let expected_kind_for_prefix = match leading {
                'G' => Some(AddressKind::G),
                'M' => Some(AddressKind::M),
                'C' => Some(AddressKind::C),
                _   => None, // unknown prefix – parser should have rejected it
            };
            match expected_kind_for_prefix {
                None => true, // parser accepted an unknown-prefix string
                Some(expected) => reported_kind != expected,
            }
        } else {
            false // rejection is always fine
        }
    }

    /// Returns `true` if the mutated address was **rejected** (any error).
    pub fn is_rejected(&self) -> bool {
        self.outcome.is_err()
    }
}

// ── Core encode/decode helpers ────────────────────────────────────────────────

/// Decode a Stellar StrKey string into raw bytes (version || payload || crc16).
/// Returns `None` if the string contains non-base-32 characters or is too short.
fn strkey_decode(addr: &str) -> Option<Vec<u8>> {
    let s = addr.to_uppercase();
    let s = s.as_bytes();
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;
    let mut out = Vec::with_capacity(s.len() * 5 / 8 + 1);
    for &ch in s {
        let val: u8 = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'2'..=b'7' => ch - b'2' + 26,
            _ => return None,
        };
        bits = (bits << 5) | (val as u32);
        bit_count += 5;
        if bit_count >= 8 {
            bit_count -= 8;
            out.push((bits >> bit_count) as u8);
            bits &= (1 << bit_count) - 1;
        }
    }
    if out.len() < 3 { None } else { Some(out) }
}

/// Encode raw bytes (version || payload || crc16) back to a StrKey string.
fn strkey_encode(data: &[u8]) -> String {
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut out = String::with_capacity(data.len() * 8 / 5 + 2);
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;
    for &byte in data {
        bits = (bits << 8) | (byte as u32);
        bit_count += 8;
        while bit_count >= 5 {
            bit_count -= 5;
            out.push(ALPHA[((bits >> bit_count) & 0x1F) as usize] as char);
        }
    }
    if bit_count > 0 {
        out.push(ALPHA[((bits << (5 - bit_count)) & 0x1F) as usize] as char);
    }
    out
}

/// CRC-16/XMODEM variant used by Stellar StrKey.
fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0x0000;
    for &byte in data {
        let mut x = (crc >> 8) ^ (byte as u16);
        x ^= x >> 4;
        crc = (crc << 8) ^ (x << 12) ^ (x << 5) ^ x;
    }
    crc
}

/// Re-encode `payload_without_version` with `new_version` and a fresh CRC-16.
///
/// Layout written: `new_version || payload_without_version || crc16_le`
fn reencode_with_version(payload_without_version: &[u8], new_version: u8) -> String {
    let mut data: Vec<u8> = Vec::with_capacity(1 + payload_without_version.len() + 2);
    data.push(new_version);
    data.extend_from_slice(payload_without_version);
    let crc = crc16(&data);
    data.push((crc & 0xFF) as u8);
    data.push((crc >> 8) as u8);
    strkey_encode(&data)
}

// ── Public mutator ────────────────────────────────────────────────────────────

/// Decode `addr`, replace the version byte with a randomly-chosen value, and
/// re-encode with a fresh checksum.
///
/// The replacement is drawn from one of **two sub-cases** chosen with equal
/// probability:
///
/// * **Known version byte** – one of `{48, 96, 16, 144}`, chosen uniformly at
///   random (may be the same as the original; that's intentional).
/// * **Invalid version byte** – any `u8` value that is *not* one of the four
///   known bytes above.
///
/// Returns `None` if `addr` cannot be decoded (non-base-32 characters, too
/// short, etc.).
pub fn swap_version_byte(addr: &str, rng: &mut impl Rng) -> Option<SwapResult> {
    // Decode the address and identify the original kind.
    let decoded = strkey_decode(addr)?;
    if decoded.len() < 3 {
        return None;
    }

    let original_kind = match parse(addr) {
        Ok(a) => a.kind(),
        Err(_) => return None, // only mutate addresses the parser accepts
    };

    // Extract the payload bytes that sit between version and CRC.
    // Layout: decoded[0] = version, decoded[1..len-2] = payload, decoded[len-2..] = crc
    let payload_without_version = &decoded[1..decoded.len() - 2];

    // Pick the sub-case.
    let injected = if rng.gen_bool(0.5) {
        // Known version byte
        let kv = KnownVersion::ALL[rng.gen_range(0..KnownVersion::ALL.len())];
        InjectedVersion::Known(kv)
    } else {
        // Invalid version byte – keep drawing until we land on something that
        // isn't one of the four known values.
        let known_bytes: [u8; 4] = KnownVersion::ALL.map(|kv| kv.byte());
        let b = loop {
            let candidate: u8 = rng.gen();
            if !known_bytes.contains(&candidate) {
                break candidate;
            }
        };
        InjectedVersion::Invalid(b)
    };

    let new_version = injected.byte();
    let mutated = reencode_with_version(payload_without_version, new_version);

    let outcome = parse(&mutated).map(|a| a.kind());

    Some(SwapResult {
        original: addr.to_uppercase(),
        original_kind,
        injected,
        mutated,
        outcome,
    })
}

/// Convenience wrapper that asserts no silent misclassification occurred.
///
/// A misclassification is when the parser returns `Ok(kind)` but that `kind`
/// does not match the prefix character of the re-encoded string – this would
/// mean routing logic could silently send funds to the wrong account type.
///
/// # Panics
/// Panics with a descriptive message if a misclassification is detected.
pub fn assert_no_misclassification(result: &SwapResult) {
    assert!(
        !result.is_misclassification(),
        "MISCLASSIFICATION DETECTED!\n\
         original:      {:?} (kind={:?})\n\
         injected byte: {:?} ({:?})\n\
         mutated:       {:?}\n\
         parser said:   {:?}\n\
         The parser returned Ok but the reported kind does not match the \
         leading prefix character of the mutated string.",
        result.original,
        result.original_kind,
        result.injected.byte(),
        result.injected,
        result.mutated,
        result.outcome,
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    // ── Fixtures ──────────────────────────────────────────────────────────────

    /// A valid G-address (verified against the Stellar reference decoder).
    const VALID_G: &str = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
    /// A valid C-address.
    const VALID_C: &str = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLT7AV7Y6S33Z6S3CHBAAAAAAAAAAAAABQD";
    /// A valid M-address.
    const VALID_M: &str = "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLT7AV7Y6S33Z6S3CHBAAAAAAAAAAAAABQD";

    fn seeded_rng(seed: u64) -> StdRng {
        StdRng::seed_from_u64(seed)
    }

    // ── Helper: encode helpers round-trip ─────────────────────────────────────

    #[test]
    fn strkey_encode_decode_roundtrip() {
        let original = strkey_decode(VALID_G).expect("valid G address must decode");
        let re_encoded = strkey_encode(&original);
        assert_eq!(re_encoded, VALID_G, "round-trip must produce the same string");
    }

    // ── Known version byte swaps ───────────────────────────────────────────────

    #[test]
    fn swap_same_version_byte_still_accepted_as_same_kind() {
        // Re-encoding with the *same* version byte must produce the original string,
        // so parse() must still return Ok with the same kind.
        let decoded = strkey_decode(VALID_G).unwrap();
        let payload = &decoded[1..decoded.len() - 2];
        let re = reencode_with_version(payload, KnownVersion::Account.byte());
        assert_eq!(re, VALID_G, "same version byte must reproduce the original");

        let result = parse(&re).expect("same-version re-encode must still parse");
        assert_eq!(result.kind(), AddressKind::G);
    }

    #[test]
    fn swap_g_version_to_m_version_is_rejected() {
        // G → M: the payload length is correct for a G address (32 bytes of key).
        // A valid M-address needs 40 additional bytes for the muxed ID, so the
        // parser should reject this with InvalidLength or InvalidMuxedPayload.
        let decoded = strkey_decode(VALID_G).unwrap();
        let payload = &decoded[1..decoded.len() - 2];
        let mutated = reencode_with_version(payload, KnownVersion::Muxed.byte());
        let outcome = parse(&mutated);
        assert!(
            outcome.is_err(),
            "G payload with M version byte must be rejected; got Ok({:?})",
            outcome.unwrap().kind()
        );
    }

    #[test]
    fn swap_g_version_to_c_version_is_reclassified_correctly() {
        // G → C: both are 56-char encodings, so the length check passes.
        // A C-address has no additional payload constraints beyond the version byte,
        // so re-encoding a G payload with VERSION_C and a fresh CRC produces a
        // *valid* C-address.  The parser must either:
        //   (a) accept it as AddressKind::C  (correct reclassification), or
        //   (b) reject it with an error.
        // What it must NOT do is return Ok with a kind that doesn't match the
        // leading 'C' prefix — that would be a silent misclassification.
        let decoded = strkey_decode(VALID_G).unwrap();
        let payload = &decoded[1..decoded.len() - 2];
        let mutated = reencode_with_version(payload, KnownVersion::Contract.byte());

        assert!(
            mutated.starts_with('C'),
            "re-encoding with VERSION_C must produce a C-prefixed string"
        );

        let outcome = parse(&mutated);
        match &outcome {
            Ok(addr) => {
                // Accepted — must be classified as C, not some other kind.
                assert_eq!(
                    addr.kind(),
                    AddressKind::C,
                    "parser accepted mutated address but returned wrong kind; \
                     expected C (matching leading prefix 'C'), got {:?}",
                    addr.kind()
                );
            }
            Err(_) => {
                // Clean rejection is also fine.
            }
        }
    }

    #[test]
    fn swap_g_version_to_seed_version_is_rejected() {
        // Seed (S) version byte is not a recognised prefix → UnknownPrefix.
        let decoded = strkey_decode(VALID_G).unwrap();
        let payload = &decoded[1..decoded.len() - 2];
        let mutated = reencode_with_version(payload, KnownVersion::Seed.byte());
        let outcome = parse(&mutated);
        assert!(
            outcome.is_err(),
            "G payload with seed version byte must be rejected; got Ok({:?})",
            outcome.unwrap().kind()
        );
    }

    #[test]
    fn swap_c_version_to_g_version_is_correctly_handled() {
        // C → G: both are 56-char encodings. A C payload (32-byte contract hash)
        // re-encoded with VERSION_G and a fresh CRC is a structurally valid G-address.
        // The parser must either accept it as G (correct reclassification) or
        // reject it cleanly — never return Ok with the wrong kind.
        let decoded = strkey_decode(VALID_C).unwrap();
        let payload = &decoded[1..decoded.len() - 2];
        let mutated = reencode_with_version(payload, KnownVersion::Account.byte());

        assert!(
            mutated.starts_with('G'),
            "re-encoding with VERSION_G must produce a G-prefixed string"
        );

        let outcome = parse(&mutated);
        match &outcome {
            Ok(addr) => {
                assert_eq!(
                    addr.kind(),
                    AddressKind::G,
                    "parser accepted mutated address but returned wrong kind; \
                     expected G (matching leading prefix 'G'), got {:?}",
                    addr.kind()
                );
            }
            Err(_) => { /* clean rejection is fine */ }
        }
    }

    #[test]
    fn swap_m_version_to_g_version_is_correctly_handled() {
        // M → G: the M payload is much larger (40+ bytes), so re-encoding with
        // VERSION_G produces a much longer string than 56 chars.  The parser
        // will reject with InvalidLength.
        let decoded = strkey_decode(VALID_M).unwrap();
        let payload = &decoded[1..decoded.len() - 2];
        let mutated = reencode_with_version(payload, KnownVersion::Account.byte());
        let outcome = parse(&mutated);
        assert!(
            outcome.is_err(),
            "M payload with G version byte must be rejected due to length mismatch; got Ok({:?})",
            outcome.as_ref().unwrap().kind()
        );
    }

    // ── Invalid version byte sub-case ─────────────────────────────────────────

    #[test]
    fn invalid_version_bytes_are_always_rejected_or_cleanly_classified() {
        let known: [u8; 4] = KnownVersion::ALL.map(|kv| kv.byte());
        let decoded = strkey_decode(VALID_G).unwrap();
        let payload = &decoded[1..decoded.len() - 2];

        // Sweep all 256 possible version bytes.
        for v in 0u8..=255 {
            let mutated = reencode_with_version(payload, v);
            let outcome = parse(&mutated);

            if known.contains(&v) {
                // Known version byte: either cleanly rejected or correctly classified.
                // We just verify there's no misclassification.
                if let Ok(addr) = &outcome {
                    let reported = addr.kind();
                    let leading = mutated.chars().next().unwrap_or('\0');
                    let expected = match leading {
                        'G' => Some(AddressKind::G),
                        'M' => Some(AddressKind::M),
                        'C' => Some(AddressKind::C),
                        _   => None,
                    };
                    assert_eq!(
                        Some(reported),
                        expected,
                        "known version byte 0x{v:02x}: parser returned Ok({reported:?}) but \
                         leading char is {leading:?}"
                    );
                }
            } else {
                // Invalid version byte: must ALWAYS be rejected.
                assert!(
                    outcome.is_err(),
                    "invalid version byte 0x{v:02x}: parser returned Ok({:?}) for \
                     mutated string {mutated:?} — silent misclassification!",
                    outcome.as_ref().unwrap().kind()
                );
            }
        }
    }

    // ── swap_version_byte() high-level API ────────────────────────────────────

    #[test]
    fn swap_version_byte_returns_none_for_invalid_input() {
        let mut rng = seeded_rng(0);
        assert!(swap_version_byte("not-valid!!!", &mut rng).is_none());
        assert!(swap_version_byte("", &mut rng).is_none());
    }

    #[test]
    fn swap_version_byte_never_misclassifies_g_address() {
        let mut rng = seeded_rng(42);
        for _ in 0..1000 {
            if let Some(result) = swap_version_byte(VALID_G, &mut rng) {
                assert_no_misclassification(&result);
            }
        }
    }

    #[test]
    fn swap_version_byte_never_misclassifies_c_address() {
        let mut rng = seeded_rng(99);
        for _ in 0..1000 {
            if let Some(result) = swap_version_byte(VALID_C, &mut rng) {
                assert_no_misclassification(&result);
            }
        }
    }

    #[test]
    fn swap_version_byte_never_misclassifies_m_address() {
        let mut rng = seeded_rng(7);
        for _ in 0..1000 {
            if let Some(result) = swap_version_byte(VALID_M, &mut rng) {
                assert_no_misclassification(&result);
            }
        }
    }

    #[test]
    fn swap_version_byte_invalid_sub_case_always_rejected() {
        // When an *invalid* (non-protocol) byte is injected, the parser must
        // always reject the result — there is no valid address type for it.
        let mut rng = seeded_rng(123);
        for _ in 0..2000 {
            if let Some(result) = swap_version_byte(VALID_G, &mut rng) {
                if result.injected.is_invalid() {
                    assert!(
                        result.is_rejected(),
                        "invalid version byte {:?} must be rejected; got Ok({:?}) for {:?}",
                        result.injected,
                        result.outcome.as_ref().unwrap(),
                        result.mutated,
                    );
                }
            }
        }
    }

    #[test]
    fn swap_version_byte_known_sub_case_never_misclassifies() {
        let mut rng = seeded_rng(555);
        for _ in 0..2000 {
            if let Some(result) = swap_version_byte(VALID_G, &mut rng) {
                if !result.injected.is_invalid() {
                    assert_no_misclassification(&result);
                }
            }
        }
    }

    #[test]
    fn result_fields_are_consistent() {
        let mut rng = seeded_rng(77);
        let result = swap_version_byte(VALID_G, &mut rng)
            .expect("valid address must produce a result");
        // Original must round-trip as the uppercased form.
        assert_eq!(result.original, VALID_G.to_uppercase());
        assert_eq!(result.original_kind, AddressKind::G);
        // The injected byte must appear in the decoded mutated string.
        let decoded = strkey_decode(&result.mutated).expect("mutated string must decode");
        assert_eq!(
            decoded[0],
            result.injected.byte(),
            "first decoded byte must be the injected version byte"
        );
    }
}
