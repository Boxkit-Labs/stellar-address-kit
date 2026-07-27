//! Differential testing binary that compares prism-core's address parser against
//! the `stellar-strkey` reference decoder. Any divergence in accept/reject verdicts
//! or decoded fields is reported as a finding, since STA claims cross-implementation
//! correctness.
//!
//! # Usage
//! ```text
//! cargo run --features diff --bin prism-diff -- --random 10000
//! cargo run --features diff --bin prism-diff -- --corpus path/to/inputs.txt
//! cargo run --features diff --bin prism-diff -- --stdin
//! ```

use std::io::{self, BufRead};
use std::path::PathBuf;
use std::str::FromStr;

use clap::Parser;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

use prism_core::address::{self, AddressKind};
use stellar_strkey::Strkey;

// ─── CLI ────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(
    name = "prism-diff",
    version,
    about = "Differential fuzzing of prism-core against the stellar-strkey reference decoder.\n\
             For each input, runs both decoders and reports any divergence in\n\
             accept/reject verdicts or decoded fields."
)]
struct Cli {
    /// Generate N random strings and diff each one
    #[arg(long, value_name = "N", conflicts_with_all = ["corpus", "stdin_mode"])]
    random: Option<usize>,

    /// Read newline-delimited inputs from FILE
    #[arg(long, value_name = "FILE", conflicts_with_all = ["random", "stdin_mode"])]
    corpus: Option<PathBuf>,

    /// Read newline-delimited inputs from stdin
    #[arg(long = "stdin", conflicts_with_all = ["random", "corpus"])]
    stdin_mode: bool,

    /// Fix the PRNG seed for reproducible runs
    #[arg(long, value_name = "U64")]
    seed: Option<u64>,

    /// Print every comparison, not just divergences
    #[arg(long, short)]
    verbose: bool,
}

// ─── Statistics ─────────────────────────────────────────────────────────────

#[derive(Default)]
struct Stats {
    total: usize,
    agree: usize,
    divergences: usize,
    /// Both rejected (valid agreement)
    both_rejected: usize,
    /// StarKey accepted a type that prism doesn't handle (T/X/P/L/B), or
    /// the S-prefix was intentionally rejected by strkey.
    non_target_skipped: usize,
}

// ─── Divergence report ──────────────────────────────────────────────────────

struct Divergence {
    input: String,
    prism_result: String,
    strkey_result: String,
    description: String,
}

impl Divergence {
    fn print(&self) {
        eprintln!("─── DIVERGENCE ───────────────────────────────────────────────");
        eprintln!("  Input:       {:?}", self.input);
        eprintln!("  prism-core:  {}", self.prism_result);
        eprintln!("  strkey:      {}", self.strkey_result);
        eprintln!("  Description: {}", self.description);
        eprintln!();
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

fn main() {
    let cli = Cli::parse();

    if cli.random.is_none() && cli.corpus.is_none() && !cli.stdin_mode {
        eprintln!("error: specify one of --random <N>, --corpus <FILE>, or --stdin");
        eprintln!("  e.g.  cargo run --features diff --bin prism-diff -- --random 10000");
        std::process::exit(2);
    }

    let seed = cli.seed.unwrap_or_else(|| rand::thread_rng().gen());
    let mut rng: StdRng = StdRng::seed_from_u64(seed);

    if cli.verbose {
        eprintln!("PRNG seed: {seed}");
    }

    let stats = if let Some(n) = cli.random {
        run_random(&mut rng, n, cli.verbose)
    } else if let Some(path) = cli.corpus {
        run_corpus(&path, cli.verbose)
    } else {
        run_stdin(cli.verbose)
    };

    eprintln!();
    eprintln!("══════════════════════════════════════════════════════════════");
    eprintln!("  Total inputs:       {}", stats.total);
    eprintln!(
        "  Agreed:             {} (incl. {} both-rejected)",
        stats.agree, stats.both_rejected
    );
    eprintln!("  Divergences:        {}", stats.divergences);
    eprintln!(
        "  Non-target skipped: {} (T/X/P/L/B keys, or S prefix)",
        stats.non_target_skipped
    );
    eprintln!("══════════════════════════════════════════════════════════════");

    if stats.divergences > 0 {
        std::process::exit(1);
    }
}

// ─── Input sources ──────────────────────────────────────────────────────────

fn run_random(rng: &mut StdRng, n: usize, verbose: bool) -> Stats {
    let mut stats = Stats::default();
    for _ in 0..n {
        diff_one(&random_string(rng), verbose, &mut stats);
    }
    stats
}

fn run_corpus(path: &PathBuf, verbose: bool) -> Stats {
    let file = std::fs::File::open(path).unwrap_or_else(|e| {
        eprintln!("error: cannot open corpus file {}: {e}", path.display());
        std::process::exit(2);
    });
    let mut stats = Stats::default();
    for line in io::BufReader::new(file).lines() {
        diff_one(&line.unwrap_or_default(), verbose, &mut stats);
    }
    stats
}

fn run_stdin(verbose: bool) -> Stats {
    let mut stats = Stats::default();
    for line in io::stdin().lock().lines() {
        diff_one(&line.unwrap_or_default(), verbose, &mut stats);
    }
    stats
}

// ─── Core comparison logic ──────────────────────────────────────────────────

fn diff_one(input: &str, verbose: bool, stats: &mut Stats) {
    stats.total += 1;

    let prism = address::parse(input);
    let strkey = Strkey::from_str(input);

    // Both rejected – agreement.
    if prism.is_err() && strkey.is_err() {
        // If strkey rejected because of S-prefix, skip — prism doesn't handle S.
        if input.starts_with('S') || input.starts_with('s') {
            stats.non_target_skipped += 1;
            if verbose {
                eprintln!("SKIP S-prefix  ← {input:?}");
            }
            return;
        }
        stats.agree += 1;
        stats.both_rejected += 1;
        if verbose {
            eprintln!("AGREE reject  ← {input:?}");
        }
        return;
    }

    // Build display strings up front.
    let prism_disp = match &prism {
        Ok(a) => format!("Ok({:?})", a.kind()),
        Err(e) => format!("Err({e})"),
    };
    let strkey_disp = match &strkey {
        Ok(sk) => format!("Ok({sk:?})"),
        Err(e) => format!("Err({e})"),
    };

    // ── One decoder accepted, the other rejected ────────────────────────

    let prism_ok = prism.is_ok();
    let strkey_ok = strkey.is_ok();

    if prism_ok != strkey_ok {
        // If starKey accepted a type that prism-core doesn't handle
        // (T, X, P, L, B), this is expected — prism only deals with G/M/C.
        if let Ok(ref sk) = strkey {
            if is_non_target_strkey(sk) {
                stats.non_target_skipped += 1;
                if verbose {
                    eprintln!("SKIP non-target ← {input:?}");
                }
                return;
            }
        }

        stats.divergences += 1;
        let description = if prism_ok {
            "Accept/reject mismatch: prism-core accepted but stellar-strkey rejected"
                .to_string()
        } else {
            "Accept/reject mismatch: prism-core rejected but stellar-strkey accepted"
                .to_string()
        };
        let div = Divergence {
            input: input.to_string(),
            prism_result: prism_disp,
            strkey_result: strkey_disp,
            description,
        };
        div.print();
        return;
    }

    // ── Both accepted – compare decoded fields ─────────────────────────

    let prism_addr = prism.unwrap();
    let strkey_val = strkey.unwrap();

    let divergence = compare_decoded(&prism_addr, &strkey_val);

    if let Some(desc) = divergence {
        stats.divergences += 1;
        let div = Divergence {
            input: input.to_string(),
            prism_result: format!("Ok({:?})", prism_addr.kind()),
            strkey_result: format!("Ok({strkey_val:?})"),
            description: desc,
        };
        div.print();
    } else {
        stats.agree += 1;
        if verbose {
            eprintln!("AGREE accept  ← {input:?}");
        }
    }
}

/// Compare the decoded fields of a prism-core `Address` and a `stellar-strkey`
/// `Strkey`. Returns `None` if they agree, or a description string if they
/// diverge.
fn compare_decoded(prism: &address::Address, strkey: &Strkey) -> Option<String> {
    match (prism.kind(), strkey) {
        // ── G-address ──────────────────────────────────────────────────
        (AddressKind::G, Strkey::PublicKeyEd25519(_)) => None,

        // ── M-address ──────────────────────────────────────────────────
        (AddressKind::M, Strkey::MuxedAccountEd25519(ma)) => {
            let strkey_muxed_id = ma.id;
            let prism_muxed_id = prism.muxed_id();

            if prism_muxed_id != Some(strkey_muxed_id) {
                return Some(format!(
                    "Muxed ID mismatch: prism={prism_muxed_id:?}, strkey={strkey_muxed_id}"
                ));
            }

            // Also compare the reconstructed base-G address.
            if let (Some(prism_base_g), Ok(decoded_base_g)) =
                (prism.base_g(), address::encode_g_address(&ma.ed25519))
            {
                if prism_base_g != decoded_base_g {
                    return Some(format!(
                        "Base-G mismatch: prism={prism_base_g:?}, strkey-derived={decoded_base_g:?}"
                    ));
                }
            }

            None
        }

        // ── C-address ──────────────────────────────────────────────────
        (AddressKind::C, Strkey::Contract(_)) => None,

        // ── Kind mismatch ──────────────────────────────────────────────
        (pk, sk) => Some(format!(
            "Kind mismatch: prism returned {pk:?}, strkey returned {sk:?}"
        )),
    }
}

/// Returns true if the `Strkey` variant is one that prism-core does not handle
/// (i.e., T, X, P, L, B). prism-core only parses G, M, and C addresses.
fn is_non_target_strkey(sk: &Strkey) -> bool {
    matches!(
        sk,
        Strkey::PreAuthTx(_)
            | Strkey::HashX(_)
            | Strkey::SignedPayloadEd25519(_)
            | Strkey::LiquidityPool(_)
            | Strkey::ClaimableBalance(_)
    )
}

// ─── Random string generation ───────────────────────────────────────────────

const STRKEY_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Generate a random string for fuzzing.  80% of the time produce a strkey-
/// shaped string (starting with G, M, or C with ~correct length); otherwise
/// produce fully arbitrary printable ASCII.
fn random_string(rng: &mut StdRng) -> String {
    if rng.gen_bool(0.80) {
        // Pick a prefix that prism-core handles.
        let prefix = match rng.gen_range(0u8..3) {
            0 => 'G',
            1 => 'M',
            _ => 'C',
        };
        let target_len: usize = if prefix == 'M' { 69 } else { 56 };
        let len = target_len.saturating_add_signed(rng.gen_range(-4..=4));
        let body: String = (0..len.saturating_sub(1))
            .map(|_| STRKEY_ALPHABET[rng.gen_range(0..STRKEY_ALPHABET.len())] as char)
            .collect();
        format!("{prefix}{body}")
    } else {
        let len = rng.gen_range(0..=128);
        (0..len)
            .map(|_| rng.gen_range(0x20u8..=0x7e) as char)
            .collect()
    }
}
