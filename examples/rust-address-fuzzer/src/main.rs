//! rust-address-fuzzer – CLI harness for fuzz-testing the prism-core
//! Stellar address parser.
//!
//! # Modes
//!
//! | Flag | Behaviour |
//! |------|-----------|
//! | `--random <N>` | Generate N random strings and parse each one. |
//! | `--corpus <FILE>` | Read newline-delimited inputs from FILE and parse each one. |
//! | `--stdin` | Read newline-delimited inputs from stdin (pipe-friendly). |
//! | `--seed <U64>` | Fix the PRNG seed for reproducible runs (default: random). |
//! | `--verbose` | Print each result instead of only failures / panics. |
//!
//! The process exits with code 0 if no panics or findings were recorded.


mod parse;

use std::io::{self, BufRead};
use std::path::PathBuf;

use clap::Parser as ClapParser;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

/// Fuzz tester for the prism-core Stellar address parser.
///
/// Generates or reads candidate address strings and calls the real parser on
/// each one.  Any panic is treated as a defect in prism-core.
#[derive(ClapParser, Debug)]
#[command(
    name = "rust-address-fuzzer",
    version,
    about = "Fuzz-tests the prism-core Stellar address parser",
    long_about = None,
)]
struct Cli {
    /// Generate N random strings and parse each one.
    #[arg(long, value_name = "N", conflicts_with_all = ["corpus", "stdin_mode"])]
    random: Option<usize>,

    /// Read newline-delimited inputs from FILE and parse each one.
    #[arg(long, value_name = "FILE", conflicts_with_all = ["random", "stdin_mode"])]
    corpus: Option<PathBuf>,

    /// Read newline-delimited inputs from stdin.
    #[arg(long = "stdin", conflicts_with_all = ["random", "corpus"])]
    stdin_mode: bool,

    /// Fix the PRNG seed for reproducible random runs.
    #[arg(long, value_name = "U64")]
    seed: Option<u64>,

    /// Print every result, not just failures.
    #[arg(long, short)]
    verbose: bool,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    let cli = Cli::parse();

    // Validate: at least one input source must be specified.
    if cli.random.is_none() && cli.corpus.is_none() && !cli.stdin_mode {
        eprintln!(
            "error: specify one of --random <N>, --corpus <FILE>, or --stdin\n\
             Run with --help for usage."
        );
        std::process::exit(2);
    }

    let seed = cli.seed.unwrap_or_else(|| rand::thread_rng().gen());
    let mut rng: StdRng = StdRng::seed_from_u64(seed);
    let verbose = cli.verbose;

    if verbose {
        eprintln!("PRNG seed: {seed}");
    }

    let stats = if let Some(n) = cli.random {
        run_random(&mut rng, n, verbose)
    } else if let Some(path) = cli.corpus {
        run_corpus(&path, verbose)
    } else {
        run_stdin(verbose)
    };

    eprintln!(
        "Done – {} inputs | {} ok | {} err | {} panics",
        stats.total, stats.ok, stats.err, stats.panics
    );

    if stats.panics > 0 {
        std::process::exit(1);
    }
}

// ---------------------------------------------------------------------------
// Fuzzing modes
// ---------------------------------------------------------------------------

#[derive(Default)]
struct Stats {
    total: usize,
    ok: usize,
    err: usize,
    panics: usize,
}

/// Fuzz with N randomly generated strings.
fn run_random(rng: &mut StdRng, n: usize, verbose: bool) -> Stats {
    let mut stats = Stats::default();
    for _ in 0..n {
        let input = random_string(rng);
        fuzz_one(&input, verbose, &mut stats);
    }
    stats
}

/// Fuzz using a newline-delimited corpus file.
fn run_corpus(path: &PathBuf, verbose: bool) -> Stats {
    let file = std::fs::File::open(path).unwrap_or_else(|e| {
        eprintln!("error: cannot open corpus file {}: {e}", path.display());
        std::process::exit(2);
    });
    let mut stats = Stats::default();
    for line in io::BufReader::new(file).lines() {
        let input = line.unwrap_or_default();
        fuzz_one(&input, verbose, &mut stats);
    }
    stats
}

/// Fuzz using newline-delimited inputs from stdin.
fn run_stdin(verbose: bool) -> Stats {
    let stdin = io::stdin();
    let mut stats = Stats::default();
    for line in stdin.lock().lines() {
        let input = line.unwrap_or_default();
        fuzz_one(&input, verbose, &mut stats);
    }
    stats
}

// ---------------------------------------------------------------------------
// Core fuzz primitive
// ---------------------------------------------------------------------------

/// Call the real parser and record the outcome in `stats`.
fn fuzz_one(input: &str, verbose: bool, stats: &mut Stats) {
    stats.total += 1;

    let result = parse::parse(input);

    match result {
        Ok(addr) => {
            stats.ok += 1;
            if verbose {
                eprintln!("OK   {:?}  ← {input:?}", addr.kind());
            }
        }
        Err(e) => {
            stats.err += 1;
            if verbose {
                eprintln!("ERR  {e:?}  ← {input:?}");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Random input generation
// ---------------------------------------------------------------------------

/// Characters that appear in real Stellar addresses – biased toward the
/// base-32 alphabet used by strkey so the parser sees more semi-valid inputs.
const STRKEY_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Generate a random string that is sometimes a plausible Stellar address.
fn random_string(rng: &mut StdRng) -> String {
    // 80 % chance of a plausible prefix + strkey body; 20 % pure garbage.
    if rng.gen_bool(0.80) {
        let prefix = match rng.gen_range(0u8..3) {
            0 => 'G',
            1 => 'M',
            _ => 'C',
        };
        // Stellar G/C addresses are 56 chars; M-addresses are 69 chars.
        let target_len: usize = match prefix {
            'G' | 'C' => 56,
            'M' => 69,
            _ => 56,
        };
        // ± a few chars to trigger length-validation paths as well.
        let len = target_len.saturating_add_signed(rng.gen_range(-4i64..=4));
        let body: String = (0..len.saturating_sub(1))
            .map(|_| STRKEY_ALPHABET[rng.gen_range(0..STRKEY_ALPHABET.len())] as char)
            .collect();
        format!("{prefix}{body}")
    } else {
        // Pure ASCII garbage of random length 0–128.
        let len = rng.gen_range(0..=128);
        (0..len)
            .map(|_| rng.gen_range(0x20u8..=0x7e) as char)
            .collect()
    }
}
