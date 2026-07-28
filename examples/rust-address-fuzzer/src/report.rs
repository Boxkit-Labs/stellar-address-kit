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
