---
"stellar-address-kit": minor
---

Add batch processing to the `stellar-route` CLI: `--file <path>` and `--stdin` accept CSV, JSON arrays, and NDJSON, and every row is streamed back as one NDJSON record with routing outcomes and structured error codes. Batch mode exits non-zero when records fail to parse, fail to route, or raise error-level warnings.
