//! Checksum-corruption mutator for Stellar StrKey addresses.
//!
//! StrKey's CRC-16 (XMODEM) is the first line of defence: after a string
//! passes the prefix, length, and base-32 checks, the parser must reject
//! any payload whose trailing two bytes do not match `crc16(payload)`.
//!
//! `corrupt_checksum` flips bits in those trailing checksum bytes **only**
//! (the version byte and payload are left untouched) and re-encodes.  The
//! resulting string must never be accepted, and the parser must never panic.
//!
//! A random flip has a 1/65536 chance of landing on the correct CRC (or of
//! flipping zero bits).  Those cases are **skipped**, not recorded as
//! findings — otherwise a coincidentally-valid checksum would look like a
//! parser bug.

use rand::Rng;

use prism_core::address::ParseError;

use crate::parse;
use crate::report::Finding;

// ── Encode / decode helpers (same alphabet and CRC as prism-core) ─────────────

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
    if out.len() < 3 {
        None
    } else {
        Some(out)
    }
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

/// Returns `true` when `addr` decodes and its trailing two bytes equal
/// `crc16(version || payload)`.  This is the CRC check only — it does not
/// run the rest of the parser.
pub fn has_valid_crc(addr: &str) -> bool {
    let decoded = match strkey_decode(addr) {
        Some(d) if d.len() >= 3 => d,
        _ => return false,
    };
    let split = decoded.len() - 2;
    let stored = u16::from_le_bytes([decoded[split], decoded[split + 1]]);
    stored == crc16(&decoded[..split])
}

// ── Public mutator ────────────────────────────────────────────────────────────

/// Decode `addr`, flip bits in the trailing two CRC-16 bytes only, and
/// re-encode.
///
/// Each of the 16 checksum bits is XORed with an independent random bit, so
/// the stored CRC is unchanged with probability 1/65536.  Callers **must**
/// run [`has_valid_crc`] on the result and skip those cases rather than
/// treating a subsequent `Ok` as a parser bug.
///
/// If `addr` cannot be decoded, the original string is returned unchanged
/// (the caller will then skip or reject it via the normal parse path).
pub fn corrupt_checksum(addr: &str, rng: &mut impl Rng) -> String {
    corrupt_checksum_with_mask(addr, rng.gen())
}

/// XOR the trailing CRC-16 with `mask` and re-encode.  `mask == 0` is a
/// no-op on a round-trippable address (used by tests to exercise the skip
/// path).
fn corrupt_checksum_with_mask(addr: &str, mask: u16) -> String {
    match strkey_decode(addr) {
        Some(mut decoded) if decoded.len() >= 3 => {
            let n = decoded.len();
            decoded[n - 2] ^= (mask & 0xFF) as u8;
            decoded[n - 1] ^= (mask >> 8) as u8;
            strkey_encode(&decoded)
        }
        _ => addr.to_string(),
    }
}

// ── Outcome classification ────────────────────────────────────────────────────

/// Result of parsing one checksum-corrupted address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChecksumCheck {
    /// The mutated string still has a matching CRC.  Skip — not a finding.
    SkippedValidChecksum,
    /// Parser correctly returned `ParseError::InvalidChecksum`.
    RejectedChecksum,
    /// Parser rejected the input for a different reason.  Still a rejection,
    /// so not a finding (the expected result is "rejected as an error").
    RejectedOther,
    /// Parser accepted a CRC-invalid address.  This is a finding.
    Accepted,
    /// Parser panicked.  This is a finding.
    Panicked,
}

impl ChecksumCheck {
    /// `Accepted` and `Panicked` must be recorded as fuzzer findings.
    pub fn is_finding(&self) -> bool {
        matches!(self, Self::Accepted | Self::Panicked)
    }
}

/// Classify a (possibly mutated) address: skip coincidentally-valid CRCs,
/// otherwise parse under `catch_unwind` and report the outcome.
pub fn check_corrupted_address(mutated: &str) -> ChecksumCheck {
    if has_valid_crc(mutated) {
        return ChecksumCheck::SkippedValidChecksum;
    }

    let mutated_owned = mutated.to_owned();
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        parse::parse(&mutated_owned)
    })) {
        Ok(Err(ParseError::InvalidChecksum)) => ChecksumCheck::RejectedChecksum,
        Ok(Err(_)) => ChecksumCheck::RejectedOther,
        Ok(Ok(_)) => ChecksumCheck::Accepted,
        Err(_) => ChecksumCheck::Panicked,
    }
}

/// Apply [`corrupt_checksum`], classify the result, and build a [`Finding`]
/// when the parser accepts the corrupted address or panics.
///
/// Returns `None` for skips and clean rejections; `Some(finding)` when the
/// parser misbehaved.
pub fn fuzz_one(addr: &str, rng: &mut impl Rng) -> (String, ChecksumCheck, Option<Finding>) {
    let mutated = corrupt_checksum(addr, rng);
    let check = check_corrupted_address(&mutated);
    let finding = match &check {
        ChecksumCheck::Accepted => Some(Finding {
            input: mutated.clone(),
            mutator: "corrupt_checksum".to_string(),
            message: "parser accepted an address whose CRC-16 does not match the payload"
                .to_string(),
        }),
        ChecksumCheck::Panicked => Some(Finding {
            input: mutated.clone(),
            mutator: "corrupt_checksum".to_string(),
            message: "parser panicked on a checksum-corrupted address".to_string(),
        }),
        _ => None,
    };
    (mutated, check, finding)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use prism_core::address::{parse, AddressKind};
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    /// A valid G-address (verified against the Stellar reference decoder).
    const VALID_G: &str = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
    /// A valid M-address (spec-vector, parseable by prism-core).
    const VALID_M: &str = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672";

    fn seeded_rng(seed: u64) -> StdRng {
        StdRng::seed_from_u64(seed)
    }

    /// Deterministic valid C-address (the public test vectors are not 56-char strkeys).
    fn valid_c() -> String {
        crate::generate::random_valid_address(AddressKind::C, &mut seeded_rng(0xC0C0_C0C0))
    }

    fn decode(addr: &str) -> Vec<u8> {
        strkey_decode(addr).expect("fixture must decode")
    }

    // ── fixtures ──────────────────────────────────────────────────────────────

    #[test]
    fn base_addresses_are_valid() {
        let valid_c = valid_c();
        for (addr, kind) in [
            (VALID_G, AddressKind::G),
            (VALID_M, AddressKind::M),
            (valid_c.as_str(), AddressKind::C),
        ] {
            let parsed = parse(addr).unwrap_or_else(|e| panic!("{addr} must parse: {e}"));
            assert_eq!(parsed.kind(), kind);
            assert!(has_valid_crc(addr), "{addr} must have a matching CRC");
        }
    }

    #[test]
    fn strkey_encode_decode_roundtrip() {
        let valid_c = valid_c();
        for addr in [VALID_G, VALID_M, valid_c.as_str()] {
            let raw = decode(addr);
            assert_eq!(
                strkey_encode(&raw),
                addr,
                "round-trip must be exact for {addr}"
            );
        }
    }

    // ── mutator contract ──────────────────────────────────────────────────────

    #[test]
    fn only_trailing_checksum_bytes_change() {
        let mut rng = seeded_rng(42);
        let valid_c = valid_c();
        for addr in [VALID_G, VALID_M, valid_c.as_str()] {
            let original = decode(addr);
            for _ in 0..64 {
                let mutated = corrupt_checksum(addr, &mut rng);
                let decoded = decode(&mutated);
                assert_eq!(
                    decoded.len(),
                    original.len(),
                    "checksum corruption must not change decoded length"
                );
                assert_eq!(
                    &decoded[..decoded.len() - 2],
                    &original[..original.len() - 2],
                    "version byte and payload must be untouched"
                );
            }
        }
    }

    #[test]
    fn prefix_and_string_length_are_preserved() {
        let mut rng = seeded_rng(7);
        let valid_c = valid_c();
        for addr in [VALID_G, VALID_M, valid_c.as_str()] {
            let mutated = corrupt_checksum(addr, &mut rng);
            assert_eq!(&mutated[..1], &addr[..1], "prefix must be preserved");
            assert_eq!(
                mutated.len(),
                addr.len(),
                "encoded length must be preserved"
            );
        }
    }

    #[test]
    fn undecodable_input_is_returned_unchanged() {
        let mut rng = seeded_rng(1);
        assert_eq!(corrupt_checksum("not-valid!!!", &mut rng), "not-valid!!!");
        assert_eq!(corrupt_checksum("", &mut rng), "");
    }

    // ── skip path: coincidentally valid CRC ───────────────────────────────────

    #[test]
    fn zero_mask_is_skipped_not_a_finding() {
        // mask == 0 leaves the CRC untouched.  parse() would return Ok, which
        // must be skipped rather than logged as a false-positive finding.
        let mutated = corrupt_checksum_with_mask(VALID_G, 0);
        assert_eq!(mutated, VALID_G);
        assert!(has_valid_crc(&mutated));
        assert_eq!(
            check_corrupted_address(&mutated),
            ChecksumCheck::SkippedValidChecksum
        );
        assert!(
            parse(&mutated).is_ok(),
            "zero-mask round-trip must still parse"
        );
    }

    #[test]
    fn restoring_the_correct_crc_is_skipped_not_a_finding() {
        // Start from a *wrong* checksum and apply the mask that restores the
        // correct CRC.  parse() returns Ok — without the skip this would be
        // a false positive.
        let original = decode(VALID_G);
        let n = original.len();
        let correct = u16::from_le_bytes([original[n - 2], original[n - 1]]);
        let wrong_mask = 0xA5A5;
        let corrupted = corrupt_checksum_with_mask(VALID_G, wrong_mask);
        assert!(
            !has_valid_crc(&corrupted),
            "pre-condition: corrupted string must fail the CRC check"
        );
        assert_eq!(
            check_corrupted_address(&corrupted),
            ChecksumCheck::RejectedChecksum
        );

        let restored = corrupt_checksum_with_mask(&corrupted, wrong_mask);
        assert!(
            has_valid_crc(&restored),
            "restoring the mask must yield a valid CRC"
        );
        assert_eq!(
            u16::from_le_bytes({
                let d = decode(&restored);
                let k = d.len();
                [d[k - 2], d[k - 1]]
            }),
            correct
        );
        assert_eq!(
            check_corrupted_address(&restored),
            ChecksumCheck::SkippedValidChecksum,
            "accidentally-valid CRC must be skipped, not recorded as a finding"
        );
        assert!(
            parse(&restored).is_ok(),
            "restored CRC would parse Ok — that is exactly the false-positive case"
        );
    }

    // ── parser must reject real corruptions ───────────────────────────────────

    fn assert_rejected_as_checksum(addr: &str, seed: u64) {
        let mut rng = seeded_rng(seed);
        let mutated = corrupt_checksum(addr, &mut rng);
        match check_corrupted_address(&mutated) {
            ChecksumCheck::SkippedValidChecksum => {}
            ChecksumCheck::RejectedChecksum => {}
            ChecksumCheck::RejectedOther => panic!(
                "checksum-only corruption of a valid address must not fail for \
                 a different reason; mutated={mutated:?} seed={seed}"
            ),
            ChecksumCheck::Accepted => panic!(
                "FINDING: parser accepted checksum-corrupted address {mutated:?} (seed={seed})"
            ),
            ChecksumCheck::Panicked => panic!(
                "FINDING: parser panicked on checksum-corrupted address {mutated:?} (seed={seed})"
            ),
        }
    }

    #[test]
    fn corrupt_g_always_checksum_err_no_panic() {
        for seed in 0..200 {
            assert_rejected_as_checksum(VALID_G, seed);
        }
    }

    #[test]
    fn corrupt_m_always_checksum_err_no_panic() {
        for seed in 0..200 {
            assert_rejected_as_checksum(VALID_M, seed);
        }
    }

    #[test]
    fn corrupt_c_always_checksum_err_no_panic() {
        let valid_c = valid_c();
        for seed in 0..200 {
            assert_rejected_as_checksum(&valid_c, seed);
        }
    }

    #[test]
    fn every_nonzero_mask_is_rejected_as_invalid_checksum() {
        // Exhaustive over a slice of masks: every non-zero XOR of a valid
        // address's CRC must produce InvalidChecksum, never Ok, never panic.
        let original = decode(VALID_G);
        let payload = &original[..original.len() - 2];
        let stored =
            u16::from_le_bytes([original[original.len() - 2], original[original.len() - 1]]);
        assert_eq!(stored, crc16(payload), "fixture CRC must match");

        for mask in 1u16..=256 {
            let mutated = corrupt_checksum_with_mask(VALID_G, mask);
            assert!(
                !has_valid_crc(&mutated),
                "non-zero mask 0x{mask:04x} must not leave a valid CRC"
            );
            assert_eq!(
                check_corrupted_address(&mutated),
                ChecksumCheck::RejectedChecksum,
                "mask 0x{mask:04x} mutated={mutated:?}"
            );
        }
    }

    #[test]
    fn fuzz_one_records_no_finding_on_valid_addresses() {
        let mut rng = seeded_rng(99);
        let valid_c = valid_c();
        for addr in [VALID_G, VALID_M, valid_c.as_str()] {
            for _ in 0..500 {
                let (_mutated, check, finding) = fuzz_one(addr, &mut rng);
                assert!(
                    !check.is_finding(),
                    "checksum corruption of a valid address must not be a finding: {check:?}"
                );
                assert!(finding.is_none());
            }
        }
    }

    #[test]
    fn fuzz_one_skip_produces_no_finding() {
        // Force the skip path via mask 0, then confirm fuzz_one's finding
        // channel stays empty when CRC is still valid.
        let mutated = corrupt_checksum_with_mask(VALID_G, 0);
        let check = check_corrupted_address(&mutated);
        assert_eq!(check, ChecksumCheck::SkippedValidChecksum);
        assert!(!check.is_finding());
    }

    #[test]
    fn generated_addresses_reject_corrupted_checksums() {
        use crate::generate::random_valid_address;

        let mut rng = seeded_rng(0xC0FF_EE11);
        for _ in 0..100 {
            for &kind in &[AddressKind::G, AddressKind::M, AddressKind::C] {
                let addr = random_valid_address(kind, &mut rng);
                let (_mutated, check, finding) = fuzz_one(&addr, &mut rng);
                assert!(
                    finding.is_none(),
                    "finding on generated {kind:?}: {check:?}"
                );
                assert!(
                    matches!(
                        check,
                        ChecksumCheck::SkippedValidChecksum | ChecksumCheck::RejectedChecksum
                    ),
                    "generated {kind:?} checksum corruption: {check:?}"
                );
            }
        }
    }
}
