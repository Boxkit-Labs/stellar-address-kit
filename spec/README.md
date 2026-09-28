# Stellar Address Kit Specification

**The normative source of truth for cross-language Stellar address routing and interop.**

This directory contains the formal definition of the Stellar Address Kit's behavior. It ensures that any compliant implementation (TypeScript, Go, Dart, etc.) produces bit-identical results for the same input, regardless of platform or language-specific quirks.

---

## 📂 Spec Structure

```text
spec/
├── schema.json      # Formal JSON Schema enforcing output structures
├── vectors.json     # The master test suite (positive/negative/edge cases)
├── validate.js      # Reference validator for the specification itself
└── README.md        # This document (Normative Design Rules)
```

---

## 🏛️ Normative Design Rules

### 1. "Never Throw" Contract

Every public function in every implementation MUST be non-throwing for any arbitrary string input. Errors must be returned as structured data within the result object.

### 2. Error vs. Warning Ontology

- **ErrorCode**: Used when the input **could not be parsed** (e.g., `INVALID_CHECKSUM`). Carried in `destinationError`.
- **WarningCode**: Used when the input was **successfully parsed** but is operationally notable (e.g., `NON_CANONICAL_ADDRESS`). Carried in `warnings[]`.

### 3. Canonicalization Invariants

- **Uppercase Primary**: All address fields in output objects MUST be uppercase.
- **Decimal Strings**: Routing IDs MUST be returned as decimal strings.
- **Leading Zeros**: Routing IDs MUST have leading zeros stripped (except for the value `"0"`), and a `NON_CANONICAL_ROUTING_ID` warning MUST be emitted.

### 4. Destination Sanitization

Before routing validation, `extractRouting` MUST remove Unicode non-printable and default-ignorable characters (including zero-width and bidirectional controls), then trim surrounding whitespace. If the destination changes, it MUST emit `SANITIZED_HIDDEN_CHARS` with `severity: 'info'` before any later routing warnings.

### 5. C-Address Safety

Contract addresses (`C...`) are valid StrKeys but are **invalid destinations** for classic payment routing. Any `extractRouting` implementation MUST emit an `INVALID_DESTINATION` warning with `severity: 'error'` if a C-address is provided as the destination.

---

## 🧪 Testing & Compliance

### The Canary Vector

To protect against JavaScript's 53-bit integer precision loss, the spec includes a **2^53+1 canary** (`id: "9007199254740993"`). Any implementation using float-based numbers internally will fail this test.

### Running Validation

Before contributing logic changes, ensure the specification itself remains valid:

```bash
pnpm spec:validate
```

---

## 🤝 Contribution Workflow

The Stellar Address Kit follows a **Spec-First** model:

1. **Vector Addition**: New behaviors or bug fixes must start by adding a case to [`vectors.json`](./vectors.json).
2. **Structural Validation**: Ensure the new vector passes the schema defined in `schema.json`.
3. **Cross-Language Parity**: Implement the change in all supported languages (TS, Go, Dart) until all tests pass the new vector suite.

---

## 📜 Versioning

The `spec_version` field in `vectors.json` coordinates the ecosystem:

- **Patch**: New tests for existing behavior.
- **Minor**: New codes or optional fields.
- **Major**: Structural changes to `RoutingInput` or `RoutingResult`.
