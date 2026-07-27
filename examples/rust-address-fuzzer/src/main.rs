mod parse;
mod report;

use std::io::{self, BufRead};
use std::panic;
use std::path::PathBuf;

use clap::Parser as ClapParser;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

#[derive(ClapParser, Debug)]
#[command(
    name = "rust-address-fuzzer",
    version,
    about = "Fuzz-tests the prism-core Stellar address parser"
)]
struct Cli {
    /// Generate N random strings and parse each one
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

    /// Print every result, not just failures
    #[arg(long, short)]
    verbose: bool,

    /// Directory to write crash findings (default: findings/)
    #[arg(long, value_name = "DIR")]
    findings_dir: Option<PathBuf>,
}

#[derive(Default)]
struct Stats {
    total: usize,
    ok: usize,
    err: usize,
    panics: usize,
}

fn main() {
    let cli = Cli::parse();

    if cli.random.is_none() && cli.corpus.is_none() && !cli.stdin_mode {
        eprintln!("error: specify one of --random <N>, --corpus <FILE>, or --stdin");
        std::process::exit(2);
    }

    let seed = cli.seed.unwrap_or_else(|| rand::thread_rng().gen());
    let mut rng: StdRng = StdRng::seed_from_u64(seed);

    let base_dir = cli.findings_dir.unwrap_or_else(|| PathBuf::from("."));
    let reporter = report::CrashReporter::new(&base_dir, Some(seed));

    if cli.verbose {
        eprintln!("PRNG seed: {seed}");
        eprintln!("Findings dir: {}", reporter.findings_dir().display());
    }

    let stats = if let Some(n) = cli.random {
        run_random(&mut rng, n, cli.verbose, &reporter)
    } else if let Some(path) = cli.corpus {
        run_corpus(&path, cli.verbose, &reporter)
    } else {
        run_stdin(cli.verbose, &reporter)
    };

    eprintln!(
        "Done – {} inputs | {} ok | {} err | {} panics",
        stats.total, stats.ok, stats.err, stats.panics
    );

    if reporter.count() > 0 {
        eprintln!("Findings written to: {}", reporter.findings_dir().display());
    }

    if stats.panics > 0 {
        std::process::exit(1);
    }
}

fn run_random(
    rng: &mut StdRng,
    n: usize,
    verbose: bool,
    reporter: &report::CrashReporter,
) -> Stats {
    let mut stats = Stats::default();
    for _ in 0..n {
        let input = random_string(rng);
        fuzz_one(&input, "random", verbose, reporter, &mut stats);
    }
    stats
}

fn run_corpus(path: &PathBuf, verbose: bool, reporter: &report::CrashReporter) -> Stats {
    let file = std::fs::File::open(path).unwrap_or_else(|e| {
        eprintln!("error: cannot open corpus file {}: {e}", path.display());
        std::process::exit(2);
    });
    let mut stats = Stats::default();
    for line in io::BufReader::new(file).lines() {
        let input = line.unwrap_or_default();
        fuzz_one(&input, "corpus", verbose, reporter, &mut stats);
    }
    stats
}

fn run_stdin(verbose: bool, reporter: &report::CrashReporter) -> Stats {
    let mut stats = Stats::default();
    for line in io::stdin().lock().lines() {
        let input = line.unwrap_or_default();
        fuzz_one(&input, "stdin", verbose, reporter, &mut stats);
    }
    stats
}

fn fuzz_one(
    input: &str,
    mutator: &str,
    verbose: bool,
    reporter: &report::CrashReporter,
    stats: &mut Stats,
) {
    stats.total += 1;

    let input_owned = input.to_owned();
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| parse::parse(&input_owned)));

    match result {
        Ok(Ok(addr)) => {
            stats.ok += 1;
            if verbose {
                eprintln!("OK   {:?}  ← {input:?}", addr.kind());
            }
        }
        Ok(Err(e)) => {
            stats.err += 1;
            if verbose {
                eprintln!("ERR  {e:?}  ← {input:?}");
            }
        }
        Err(panic_info) => {
            stats.panics += 1;
            let message = if let Some(s) = panic_info.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic".to_string()
            };
            let path = reporter.record(input, mutator, &message);
            eprintln!(
                "PANIC #{:?}  ← {input:?}  (mutator={mutator}, written={})",
                reporter.count(),
                path.display(),
            );
        }
    }
}

const STRKEY_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

fn random_string(rng: &mut StdRng) -> String {
    if rng.gen_bool(0.80) {
        let prefix = match rng.gen_range(0u8..3) {
            0 => 'G',
            1 => 'M',
            _ => 'C',
        };
        let target_len: usize = if prefix == 'M' { 69 } else { 56 };
        let len = target_len.saturating_add_signed(rng.gen_range(-4i64..=4));
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
