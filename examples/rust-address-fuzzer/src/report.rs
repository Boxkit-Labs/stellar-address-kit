use std::fs;
use std::path::Path;

pub struct Finding {
    pub input: String,
    pub mutator: String,
    pub panic_message: String,
    pub seed: u64,
    pub iteration: usize,
}

#[derive(Default)]
pub struct Report {
    pub inputs_run: usize,
    pub findings: Vec<Finding>,
    pub divergences: usize,
}

impl Report {
    pub fn record_finding(&mut self, finding: Finding, directory: &Path) {
        if let Err(error) = fs::create_dir_all(directory) {
            eprintln!(
                "error: cannot create findings directory {}: {error}",
                directory.display()
            );
        } else {
            let path = directory.join(format!("finding-{:06}.json", self.findings.len() + 1));
            if let Err(error) = fs::write(&path, finding_json(&finding)) {
                eprintln!("error: cannot write finding {}: {error}", path.display());
            }
        }
        self.findings.push(finding);
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
            "{{\n  \"inputs_run\": {},\n  \"findings_count\": {},\n  \"divergences\": {}\n}}",
            self.inputs_run,
            self.findings.len(),
            self.divergences
        );
    }
}

fn finding_json(finding: &Finding) -> String {
    format!(
        "{{\n  \"input\": {},\n  \"mutator\": {},\n  \"panic_message\": {},\n  \"seed\": {},\n  \"iteration\": {}\n}}\n",
        json_string(&finding.input),
        json_string(&finding.mutator),
        json_string(&finding.panic_message),
        finding.seed,
        finding.iteration
    )
}

fn json_string(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            character if character.is_control() => {
                escaped.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => escaped.push(character),
        }
    }
    escaped.push('"');
    escaped
}
