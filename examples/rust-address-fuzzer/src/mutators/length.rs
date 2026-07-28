use rand::Rng;

/// Base32 alphabet used by StrKey (RFC 4648 without padding).
const STRKEY_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Truncates a random number of trailing characters from `addr`.
///
/// At least 1 character (and no more than half the address length) is removed.
/// The resulting string is guaranteed to have a different length than the
/// original, so the parser must reject it.
pub fn truncate(addr: &str, rng: &mut impl Rng) -> String {
    let len = addr.len();
    // Remove between 1 and max(1, len/2) trailing chars
    let max_remove = (len / 2).max(1);
    let remove = rng.gen_range(1..=max_remove);
    let truncated_len = len.saturating_sub(remove);
    addr[..truncated_len].to_string()
}

/// Appends random base32 characters to `addr`.
///
/// Between 1 and 16 extra characters are added, guaranteeing the result is
/// too long for any valid Stellar address.
pub fn pad(addr: &str, rng: &mut impl Rng) -> String {
    let extra = rng.gen_range(1..=16);
    let suffix: String = (0..extra)
        .map(|_| STRKEY_ALPHABET[rng.gen_range(0..STRKEY_ALPHABET.len())] as char)
        .collect();
    format!("{addr}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    // Valid addresses from the spec test vectors.
    const VALID_G: &str = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
    const VALID_M: &str = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672";

    // ------------------------------------------------------------------
    // setup guard: verify base addresses are parseable first
    // ------------------------------------------------------------------

    #[test]
    fn base_addresses_are_valid() {
        assert!(
            prism_core::address::parse(VALID_G).is_ok(),
            "VALID_G must be parseable: {VALID_G}"
        );
        assert!(
            prism_core::address::parse(VALID_M).is_ok(),
            "VALID_M must be parseable: {VALID_M}"
        );
    }

    // ------------------------------------------------------------------
    // truncate sanity checks
    // ------------------------------------------------------------------

    #[test]
    fn truncate_produces_shorter_string() {
        let mut rng = StdRng::seed_from_u64(42);
        let result = truncate(VALID_G, &mut rng);
        assert!(
            result.len() < VALID_G.len(),
            "truncated string must be shorter ({} vs {})",
            result.len(),
            VALID_G.len()
        );
    }

    #[test]
    fn truncate_preserves_prefix() {
        let mut rng = StdRng::seed_from_u64(42);
        let result = truncate(VALID_G, &mut rng);
        assert_eq!(&result[..1], "G", "prefix must be preserved");
    }

    // ------------------------------------------------------------------
    // truncate: every seed must produce Err (no panic, no Ok)
    // ------------------------------------------------------------------

    #[test]
    fn truncate_g_always_err_no_panic() {
        for seed in 0..200 {
            let mut rng = StdRng::seed_from_u64(seed);
            let result = truncate(VALID_G, &mut rng);
            let parse_out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                prism_core::address::parse(&result)
            }));
            match parse_out {
                Ok(Err(_)) => {} // expected
                Ok(Ok(addr)) => {
                    panic!(
                        "truncated G input {result:?} (len={}, seed={seed}) parsed as OK({addr:?})",
                        result.len()
                    )
                }
                Err(_) => {
                    panic!(
                        "truncated G input {result:?} (len={}, seed={seed}) caused a panic",
                        result.len()
                    )
                }
            }
        }
    }

    #[test]
    fn truncate_m_always_err_no_panic() {
        for seed in 0..200 {
            let mut rng = StdRng::seed_from_u64(seed);
            let result = truncate(VALID_M, &mut rng);
            let parse_out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                prism_core::address::parse(&result)
            }));
            match parse_out {
                Ok(Err(_)) => {} // expected
                Ok(Ok(addr)) => {
                    panic!(
                        "truncated M input {result:?} (len={}, seed={seed}) parsed as OK({addr:?})",
                        result.len()
                    )
                }
                Err(_) => {
                    panic!(
                        "truncated M input {result:?} (len={}, seed={seed}) caused a panic",
                        result.len()
                    )
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // pad sanity checks
    // ------------------------------------------------------------------

    #[test]
    fn pad_produces_longer_string() {
        let mut rng = StdRng::seed_from_u64(42);
        let result = pad(VALID_G, &mut rng);
        assert!(
            result.len() > VALID_G.len(),
            "padded string must be longer ({} vs {})",
            result.len(),
            VALID_G.len()
        );
    }

    #[test]
    fn pad_preserves_prefix() {
        let mut rng = StdRng::seed_from_u64(42);
        let result = pad(VALID_G, &mut rng);
        assert_eq!(&result[..1], "G", "prefix must be preserved");
    }

    // ------------------------------------------------------------------
    // pad: every seed must produce Err (no panic, no Ok)
    // ------------------------------------------------------------------

    #[test]
    fn pad_g_always_err_no_panic() {
        for seed in 0..200 {
            let mut rng = StdRng::seed_from_u64(seed);
            let result = pad(VALID_G, &mut rng);
            let parse_out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                prism_core::address::parse(&result)
            }));
            match parse_out {
                Ok(Err(_)) => {} // expected
                Ok(Ok(addr)) => {
                    panic!(
                        "padded G input {result:?} (len={}, seed={seed}) parsed as OK({addr:?})",
                        result.len()
                    )
                }
                Err(_) => {
                    panic!(
                        "padded G input {result:?} (len={}, seed={seed}) caused a panic",
                        result.len()
                    )
                }
            }
        }
    }

    #[test]
    fn pad_m_always_err_no_panic() {
        for seed in 0..200 {
            let mut rng = StdRng::seed_from_u64(seed);
            let result = pad(VALID_M, &mut rng);
            let parse_out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                prism_core::address::parse(&result)
            }));
            match parse_out {
                Ok(Err(_)) => {} // expected
                Ok(Ok(addr)) => {
                    panic!(
                        "padded M input {result:?} (len={}, seed={seed}) parsed as OK({addr:?})",
                        result.len()
                    )
                }
                Err(_) => {
                    panic!(
                        "padded M input {result:?} (len={}, seed={seed}) caused a panic",
                        result.len()
                    )
                }
            }
        }
    }
}
