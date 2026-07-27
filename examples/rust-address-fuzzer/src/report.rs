use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// A single crash finding recorded by the fuzzer.
#[derive(Debug, Clone)]
pub struct Finding {
    /// Monotonically increasing finding number.
    pub id: u64,
    /// The exact input that triggered the panic.
    pub input: String,
    /// Name of the mutator that produced this input.
    pub mutator: String,
    /// The panic message from `catch_unwind`.
    pub panic_message: String,
    /// Unix timestamp (seconds since epoch).
    pub timestamp: u64,
    /// PRNG seed used for this run (if deterministic).
    pub seed: Option<u64>,
}

/// Writes findings as JSON files to `findings/` directory.
pub struct CrashReporter {
    dir: PathBuf,
    counter: AtomicU64,
    seed: Option<u64>,
}

impl CrashReporter {
    /// Create a reporter that writes to `findings/` under the given base path.
    pub fn new(base: impl AsRef<Path>, seed: Option<u64>) -> Self {
        let dir = base.as_ref().join("findings");
        fs::create_dir_all(&dir).expect("failed to create findings directory");
        Self {
            dir,
            counter: AtomicU64::new(1),
            seed,
        }
    }

    /// Record a finding and return the path to the written JSON file.
    pub fn record(&self, input: &str, mutator: &str, panic_message: &str) -> PathBuf {
        let id = self.counter.fetch_add(1, Ordering::Relaxed);
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let finding = Finding {
            id,
            input: input.to_owned(),
            mutator: mutator.to_owned(),
            panic_message: panic_message.to_owned(),
            timestamp,
            seed: self.seed,
        };

        let filename = format!("finding_{id:06}.json");
        let path = self.dir.join(&filename);
        fs::write(&path, finding.to_json()).expect("failed to write finding file");
        path
    }

    /// Return the total number of findings recorded.
    pub fn count(&self) -> u64 {
        self.counter.load(Ordering::Relaxed) - 1
    }

    /// Return the path to the findings directory.
    pub fn findings_dir(&self) -> &Path {
        &self.dir
    }
}

impl Finding {
    /// Serialize to a JSON string without requiring `serde_json`.
    pub fn to_json(&self) -> String {
        format!(
            r#"{{"id":{},"input":{},"mutator":{},"panic_message":{},"timestamp":{},"seed":{}}}"#,
            self.id,
            escape_json(&self.input),
            escape_json(&self.mutator),
            escape_json(&self.panic_message),
            self.timestamp,
            match self.seed {
                Some(s) => format!("{s}"),
                None => "null".to_string(),
            },
        )
    }
}

/// Escape a string for JSON embedding.
fn escape_json(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
