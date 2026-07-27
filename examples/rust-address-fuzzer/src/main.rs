mod parse;

use std::io::{self, BufRead};
use std::path::PathBuf;

use clap::Parser as ClapParser;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

#[derive(ClapParser, Debug)]
#[command(name = "rust-address-fuzzer", version, about = "Fuzz-tests the prism-core Stellar address parser")]
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

    eprintln!(
        "Done – {} inputs | {} ok | {} err | {} panics",
        stats.total, stats.ok, stats.err, stats.panics
    );

    if stats.panics > 0 {
        std::process::exit(1);
    }
}

fn run_random(rng: &mut StdRng, n: usize, verbose: bool) -> Stats {
    let mut stats = Stats::default();
    for _ in 0..n {
        fuzz_one(&random_string(rng), verbose, &mut stats);
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
        fuzz_one(&line.unwrap_or_default(), verbose, &mut stats);
    }
    stats
}

fn run_stdin(verbose: bool) -> Stats {
    let mut stats = Stats::default();
    for line in io::stdin().lock().lines() {
        fuzz_one(&line.unwrap_or_default(), verbose, &mut stats);
    }
    stats
}

fn fuzz_one(input: &str, verbose: bool, stats: &mut Stats) {
    stats.total += 1;
    match parse::parse(input) {
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
        (0..len).map(|_| rng.gen_range(0x20u8..=0x7e) as char).collect()
    }
}
