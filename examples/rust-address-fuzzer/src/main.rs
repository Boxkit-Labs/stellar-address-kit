mod generate;
mod mutators;
mod parse;
mod report;

use std::any::Any;
use std::io::{self, BufRead};
use std::path::{Path, PathBuf};

use clap::Parser as ClapParser;
use prism_core::address::AddressKind;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

const FINDINGS_DIR: &str = "findings";

#[derive(ClapParser, Debug)]
#[command(
    name = "rust-address-fuzzer",
    version,
    about = "Fuzz-tests the prism-core Stellar address parser"
)]
struct Cli {
    /// Generate N valid seeds, mutate each one, and parse each mutation
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
    let mut rng = StdRng::seed_from_u64(seed);
    let findings_dir = Path::new(FINDINGS_DIR);

    if cli.verbose {
        eprintln!("PRNG seed: {seed}");
    }

    let mut stats = if let Some(n) = cli.random {
        let max = cli.max_iterations.unwrap_or(n).min(n);
        run_random(&mut rng, max, seed, cli.verbose, findings_dir)
    } else if let Some(path) = cli.corpus {
        run_corpus(&path, cli.verbose, cli.max_iterations, seed, findings_dir)
    } else {
        run_stdin(cli.verbose, cli.max_iterations, seed, findings_dir)
    };

    stats.report.inputs_run = stats.total;
    eprintln!(
        "Done – {} inputs | {} ok | {} err | {} findings",
        stats.total,
        stats.ok,
        stats.err,
        stats.report.findings.len()
    );
    stats.report.print_json();

    if !stats.report.findings.is_empty() || stats.report.divergences > 0 {
        std::process::exit(1);
    }
}

fn run_random(rng: &mut StdRng, n: usize, seed: u64, verbose: bool, findings_dir: &Path) -> Stats {
    let mut stats = Stats::default();
    for iteration in 0..n {
        let kind = match iteration % 3 {
            0 => AddressKind::G,
            1 => AddressKind::M,
            _ => AddressKind::C,
        };
        let base = generate::random_valid_address(kind, rng);
        let (mutator, input) = mutate(&base, rng);
        fuzz_one(
            &input,
            mutator,
            iteration,
            seed,
            verbose,
            &mut stats,
            findings_dir,
        );
    }
    stats
}

fn mutate<'a>(base: &str, rng: &mut impl Rng) -> (&'a str, String) {
    match rng.gen_range(0..4) {
        0 => ("truncate", mutators::length::truncate(base, rng)),
        1 => ("pad", mutators::length::pad(base, rng)),
        2 => match mutators::version::swap_version_byte(base, rng) {
            Some(result) => ("swap_version_byte", result.mutated),
            None => ("identity", base.to_owned()),
        },
        _ => (
            "corrupt_checksum",
            mutators::checksum::corrupt_checksum(base, rng),
        ),
    }
}

fn run_corpus(
    path: &Path,
    verbose: bool,
    max_iters: Option<usize>,
    seed: u64,
    findings_dir: &Path,
) -> Stats {
    let file = std::fs::File::open(path).unwrap_or_else(|error| {
        eprintln!("error: cannot open corpus file {}: {error}", path.display());
        std::process::exit(2);
    });
    let mut stats = Stats::default();
    for (iteration, line) in io::BufReader::new(file).lines().enumerate() {
        if max_iters.is_some_and(|max| iteration >= max) {
            break;
        }
        fuzz_one(
            &line.unwrap_or_default(),
            "corpus",
            iteration,
            seed,
            verbose,
            &mut stats,
            findings_dir,
        );
    }
    stats
}

fn run_stdin(verbose: bool, max_iters: Option<usize>, seed: u64, findings_dir: &Path) -> Stats {
    let mut stats = Stats::default();
    for (iteration, line) in io::stdin().lock().lines().enumerate() {
        if max_iters.is_some_and(|max| iteration >= max) {
            break;
        }
        fuzz_one(
            &line.unwrap_or_default(),
            "stdin",
            iteration,
            seed,
            verbose,
            &mut stats,
            findings_dir,
        );
    }
    stats
}

fn fuzz_one(
    input: &str,
    mutator: &str,
    iteration: usize,
    seed: u64,
    verbose: bool,
    stats: &mut Stats,
    findings_dir: &Path,
) {
    stats.total += 1;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| parse::parse(input)));

    match result {
        Ok(Ok(address)) => {
            stats.ok += 1;
            if verbose {
                eprintln!("OK   {:?}  ← {input:?}", address.kind());
            }
            // A checksum-corrupted address that still parses is a finding,
            // unless the flip accidentally restored a valid CRC (skip).
            if mutator == "corrupt_checksum" && !mutators::checksum::has_valid_crc(input) {
                let panic_message =
                    "parser accepted an address whose CRC-16 does not match the payload".to_owned();
                eprintln!(
                    "FINDING [{mutator}] at iteration {iteration} ← {input:?}: {panic_message}"
                );
                stats.report.record_finding(
                    report::Finding {
                        input: input.to_owned(),
                        mutator: mutator.to_owned(),
                        panic_message,
                        seed,
                        iteration,
                    },
                    findings_dir,
                );
            }
        }
        Ok(Err(error)) => {
            stats.err += 1;
            if verbose {
                eprintln!("ERR  {error:?}  ← {input:?}");
            }
        }
        Err(payload) => {
            stats.panics += 1;
            let panic_message = panic_message(payload.as_ref());
            eprintln!("PANIC [{mutator}] at iteration {iteration} ← {input:?}: {panic_message}");
            stats.report.record_finding(
                report::Finding {
                    input: input.to_owned(),
                    mutator: mutator.to_owned(),
                    panic_message,
                    seed,
                    iteration,
                },
                findings_dir,
            );
        }
    }
}

fn panic_message(payload: &(dyn Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        message.clone()
    } else if let Some(message) = payload.downcast_ref::<&str>() {
        (*message).to_owned()
    } else {
        "unknown panic payload".to_owned()
    }
}
