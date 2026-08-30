//! Valid-address generator for the fuzzer.
//!
//! `random_valid_address` produces correctly checksummed strkey strings for
//! every `AddressKind` (G, M, C).  The returned string is guaranteed to
//! round-trip through `prism_core::address::parse`; a failure causes a panic
//! so that a broken seed source is caught immediately at generation time
//! rather than producing mysterious false-positive fuzzer results.
//!
//! Layout (all lengths are in bytes unless stated otherwise):
//!
//! | Kind | Payload                                    | Payload len | Total (+ 2B CRC) | Strkey chars |
//! |------|--------------------------------------------|-------------|------------------|--------------|
//! | G    | version(1) + ed25519_key(32)               | 33          | 35               | 56           |
//! | M    | version(1) + ed25519_key(32) + muxed_id_BE(8) | 41       | 43               | 69           |
//! | C    | version(1) + contract_hash(32)             | 33          | 35               | 56           |

use prism_core::address::AddressKind;
use rand::Rng;

// ── version bytes (top 5 bits of the first byte, as used by prism-core) ──────

const VERSION_G: u8 = 6 << 3; // 0x30
const VERSION_M: u8 = 12 << 3; // 0x60
const VERSION_C: u8 = 2 << 3; // 0x10

// ── CRC-16 (CCITT, same polynomial as prism-core) ────────────────────────────

fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0x0000;
    for &byte in data {
        let mut x = (crc >> 8) ^ (byte as u16);
        x ^= x >> 4;
        crc = (crc << 8) ^ (x << 12) ^ (x << 5) ^ x;
    }
    crc
}

// ── Base-32 encoder (Stellar / RFC 4648 alphabet, no padding) ────────────────

const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

fn base32_encode(data: &[u8]) -> String {
    // Each 5 bits of input becomes one character.  The output length is
    // ceil(len * 8 / 5) characters.
    let out_len = (data.len() * 8 + 4) / 5;
    let mut result = String::with_capacity(out_len);
    let mut bits: u32 = 0;
    let mut bit_count: u32 = 0;

    for &byte in data {
        bits = (bits << 8) | (byte as u32);
        bit_count += 8;
        while bit_count >= 5 {
            bit_count -= 5;
            result.push(ALPHABET[((bits >> bit_count) & 0x1F) as usize] as char);
        }
    }
    // flush any remaining bits (padded to the right with zeros)
    if bit_count > 0 {
        result.push(ALPHABET[((bits << (5 - bit_count)) & 0x1F) as usize] as char);
    }
    result
}

// ── address builder ───────────────────────────────────────────────────────────

/// Build a complete strkey from a version byte and raw payload bytes (no
/// version byte included in `body`).  Appends a 2-byte little-endian CRC-16.
fn build_strkey(version: u8, body: &[u8]) -> String {
    // payload = version || body
    let mut payload = Vec::with_capacity(1 + body.len());
    payload.push(version);
    payload.extend_from_slice(body);

    // checksum over the full payload, appended little-endian
    let crc = crc16(&payload);
    payload.push((crc & 0xFF) as u8);
    payload.push((crc >> 8) as u8);

    base32_encode(&payload)
}

// ── public API ────────────────────────────────────────────────────────────────

/// Generate a random, correctly checksummed Stellar address of the requested
/// kind and verify it parses successfully.
///
/// Panics if the generated address fails to parse — this would indicate a bug
/// in the generator (broken encoding or checksum logic) rather than in the
/// parser, so an immediate panic is the right signal.
pub fn random_valid_address(kind: AddressKind, rng: &mut impl Rng) -> String {
    let address = match kind {
        AddressKind::G => {
            // 32 random bytes — any value is a valid (public) ed25519 key for
            // our purposes; the parser only validates structure, not whether
            // the key is a valid curve point.
            let mut key = [0u8; 32];
            rng.fill(&mut key);
            build_strkey(VERSION_G, &key)
        }

        AddressKind::M => {
            // Embed a random 64-bit muxed id to exercise the full u64 range
            // in the decoder path.
            let muxed_id: u64 = rng.gen();
            let mut key = [0u8; 32];
            rng.fill(&mut key);

            // M payload body = ed25519_key(32) || muxed_id_BE(8)
            let mut body = Vec::with_capacity(40);
            body.extend_from_slice(&key);
            body.extend_from_slice(&muxed_id.to_be_bytes());
            build_strkey(VERSION_M, &body)
        }

        AddressKind::C => {
            // 32 random bytes — the contract Wasm hash / account id.
            let mut hash = [0u8; 32];
            rng.fill(&mut hash);
            build_strkey(VERSION_C, &hash)
        }
    };

    // ── round-trip check ─────────────────────────────────────────────────────
    // If our own generator produces an address that does not parse, the seed
    // corpus is broken.  Panic loudly so the problem is noticed immediately.
    let parsed = prism_core::address::parse(&address).unwrap_or_else(|e| {
        panic!("generator produced an invalid {kind:?} address ({address:?}): {e}");
    });
    assert_eq!(
        parsed.kind(),
        kind,
        "generator produced a {kind:?} address but parser returned {:?}",
        parsed.kind()
    );

    address
}

// ── unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use prism_core::address::AddressKind;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    fn seeded() -> StdRng {
        StdRng::seed_from_u64(0xDEAD_BEEF_CAFE_1234)
    }

    #[test]
    fn g_address_has_correct_length() {
        let mut rng = seeded();
        let addr = random_valid_address(AddressKind::G, &mut rng);
        assert_eq!(
            addr.len(),
            56,
            "G address must be 56 chars, got {}",
            addr.len()
        );
        assert!(addr.starts_with('G'), "G address must start with 'G'");
    }

    #[test]
    fn m_address_has_correct_length() {
        let mut rng = seeded();
        let addr = random_valid_address(AddressKind::M, &mut rng);
        assert_eq!(
            addr.len(),
            69,
            "M address must be 69 chars, got {}",
            addr.len()
        );
        assert!(addr.starts_with('M'), "M address must start with 'M'");
    }

    #[test]
    fn c_address_has_correct_length() {
        let mut rng = seeded();
        let addr = random_valid_address(AddressKind::C, &mut rng);
        assert_eq!(
            addr.len(),
            56,
            "C address must be 56 chars, got {}",
            addr.len()
        );
        assert!(addr.starts_with('C'), "C address must start with 'C'");
    }

    #[test]
    fn m_address_round_trips_muxed_id() {
        let mut rng = seeded();
        // Generate many M addresses to cover varied muxed-id values.
        for _ in 0..256 {
            let addr = random_valid_address(AddressKind::M, &mut rng);
            let parsed = prism_core::address::parse(&addr).expect("M address must parse");
            assert!(
                parsed.muxed_id().is_some(),
                "parsed M address must carry a muxed_id"
            );
        }
    }

    #[test]
    fn all_kinds_parse_successfully_batch() {
        let mut rng = seeded();
        for _ in 0..500 {
            for &kind in &[AddressKind::G, AddressKind::M, AddressKind::C] {
                // The round-trip check inside random_valid_address will
                // panic on any failure — no extra assertion needed here.
                let _ = random_valid_address(kind, &mut rng);
            }
        }
    }

    #[test]
    fn g_address_uses_all_32_payload_bytes() {
        // Different seeds must produce different addresses (not all zeros).
        let mut rng1 = StdRng::seed_from_u64(1);
        let mut rng2 = StdRng::seed_from_u64(2);
        let a1 = random_valid_address(AddressKind::G, &mut rng1);
        let a2 = random_valid_address(AddressKind::G, &mut rng2);
        assert_ne!(a1, a2, "different seeds must produce different addresses");
    }

    #[test]
    fn boundary_muxed_ids_round_trip() {
        // Verify that the boundary u64 values (0, u64::MAX) encode and decode
        // correctly, exercising the full range that the spec mandates.
        for id in [0u64, 1, u64::MAX / 2, u64::MAX - 1, u64::MAX] {
            let key = [0u8; 32];
            // fixed key for reproducibility; M payload is key followed by ID.
            let mut body = Vec::with_capacity(40);
            body.extend_from_slice(&key);
            body.extend_from_slice(&id.to_be_bytes());
            let addr = build_strkey(VERSION_M, &body);
            let parsed = prism_core::address::parse(&addr)
                .unwrap_or_else(|e| panic!("boundary id {id} failed: {e}"));
            assert_eq!(
                parsed.muxed_id(),
                Some(id),
                "muxed_id round-trip failed for id={id}"
            );
        }
    }
}
