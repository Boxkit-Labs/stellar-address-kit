/// A single fuzzer finding: the parser accepted a mutation it must reject,
/// or panicked while parsing it.
#[derive(Debug, Clone)]
pub struct Finding {
    pub input: String,
    pub mutator: String,
    pub message: String,
}

#[derive(Default)]
pub struct Report {
    pub inputs_run: usize,
    pub findings_count: usize,
    pub divergences: usize,
}

impl Report {
    pub fn new() -> Self {
        Self {
            inputs_run: 0,
            findings_count: 0,
            divergences: 0,
        }
    }

    /// Record a finding and persist a one-line reproducer for replay.
    pub fn record_finding(&mut self, finding: Finding) {
        self.findings_count += 1;
        eprintln!(
            "FINDING [{}] {}  ← {:?}",
            finding.mutator, finding.message, finding.input
        );
        let _ = std::fs::write("reproducer.txt", &finding.input);
    }

    pub fn print_json(&self) {
        println!(
            r#"{{
  "inputs_run": {},
  "findings_count": {},
  "divergences": {}
}}"#,
            self.inputs_run, self.findings_count, self.divergences
        );
    }
}
