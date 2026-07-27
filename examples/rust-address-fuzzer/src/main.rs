mod parse;
mod report;

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

    /// Stop fuzzing after this many iterations
    #[arg(long, value_name = "N")]
    max_iterations: Option<usize>,

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
    report: report::Report,
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

    let mut stats = if let Some(n) = cli.random {
        let max = cli.max_iterations.unwrap_or(n);
        run_random(&mut rng, max.min(n), cli.verbose)
    } else if let Some(path) = cli.corpus {
        run_corpus(&path, cli.verbose, cli.max_iterations)
    } else {
        run_stdin(cli.verbose, cli.max_iterations)
    };

    stats.report.inputs_run = stats.total;
    stats.report.findings_count = stats.panics; // In the future, logic errors would also go here.
    
    eprintln!(
        "Done – {} inputs | {} ok | {} err | {} findings",
        stats.total, stats.ok, stats.err, stats.report.findings_count
    );

    stats.report.print_json();

    if stats.report.findings_count > 0 || stats.report.divergences > 0 {
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

fn run_corpus(path: &PathBuf, verbose: bool, max_iters: Option<usize>) -> Stats {
    let file = std::fs::File::open(path).unwrap_or_else(|e| {
        eprintln!("error: cannot open corpus file {}: {e}", path.display());
        std::process::exit(2);
    });
    let mut stats = Stats::default();
    for (i, line) in io::BufReader::new(file).lines().enumerate() {
        if let Some(m) = max_iters {
            if i >= m { break; }
        }
        fuzz_one(&line.unwrap_or_default(), verbose, &mut stats);
    }
    stats
}

fn run_stdin(verbose: bool, max_iters: Option<usize>) -> Stats {
    let mut stats = Stats::default();
    for (i, line) in io::stdin().lock().lines().enumerate() {
        if let Some(m) = max_iters {
            if i >= m { break; }
        }
        fuzz_one(&line.unwrap_or_default(), verbose, &mut stats);
    }
    stats
}

fn fuzz_one(input: &str, verbose: bool, stats: &mut Stats) {
    stats.total += 1;
    let input_owned = input.to_owned();
    let res = std::panic::catch_unwind(|| parse::parse(&input_owned));
    
    match res {
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
        Err(_) => {
            stats.panics += 1;
            eprintln!("PANIC  ← {input:?}");
            let _ = std::fs::write("reproducer.txt", input);
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
        let len = target_len.saturating_add_signed(rng.gen_range(-4..=4));
        let body: String = (0..len.saturating_sub(1))
            .map(|_| STRKEY_ALPHABET[rng.gen_range(0..STRKEY_ALPHABET.len())] as char)
            .collect();
        format!("{prefix}{body}")
    } else {
        let len = rng.gen_range(0..=128);
        (0..len).map(|_| rng.gen_range(0x20u8..=0x7e) as char).collect()
    }
}
