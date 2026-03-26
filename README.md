# stellar-address-kit
The deposit routing & address interop spec for Stellar (G/M/C + memos). Implemented across TypeScript, Go, and Dart.

Not an SDK replacement but instead an application-layer routing logic the SDK (Stellar SDK) does not provide; built on top of it. It's specified in `spec/vectors.json`, and validated identically across all three language implementations (Go, Dart, TypeScript).


## Project Structure

```
stellar-address-kit/
├── spec/                # Normative Specification (The Source of Truth)
│   ├── README.md        # Design philosophy and normative rules
│   ├── schema.json      # JSON Schema for test vectors
│   ├── vectors.json     # Multi-language test vectors (ID/M-address/Contract)
│   └── validate.js      # Spec validator (AJV)
├── packages/            # Language-specific implementations
│   ├── spec/            # Shared NPM package for test vectors
│   ├── core-ts/         # TypeScript reference implementation
│   ├── core-go/         # Go performance implementation
│   └── core-dart/       # Dart/Flutter wallet implementation
├── docs/                # Product Documentation
│   └── guides/          # Migration and integration guides
├── scripts/             # Maintenance & Release utilities
└── .changeset/          # Coordinated versioning configuration
```


## Why This Exists

Stellar has three address types that coexist in real payment flows:

| Prefix | Type | Used For |
|--------|------|----------|
| G… | Classic account | Standard payments |
| M… | Muxed account | Pooled accounts, exchange subaccounts, G address + embedded 64-bit ID |
| C… | Contract address | Soroban smart contracts, not a valid destination for classic payment routing |

Routing a deposit correctly requires knowing which type you received, whether to read the routing identifier from the muxed ID or the memo field, and what to do when both are present, or neither. Getting this wrong causes lost deposits.

The Stellar SDK exposes the primitives. This library encodes the routing policy on top of them, which is the part that exchanges, wallets and payment platforms implement differently, inconsistently and sometimes incorrectly. See Stellar's [pooled account](https://developers.stellar.org) and [muxed account](https://developers.stellar.org) guidance for the underlying motivation.


## What This Library Does NOT Do

- Does not resolve federation addresses (`name*domain.com`), use SEP-2 tooling for that
- Does not build, sign, or submit transactions, this is not an SDK
- Does not parse full transaction XDR, caller supplies `RoutingInput` from their own transaction parsing
- Does not wrap or replace `@stellar/stellar-sdk`, it depends on it


## Packages

| Package | Language | Purpose |
|---------|----------|---------|
| `stellar-address-kit` | TypeScript | Reference implementation |
| `core-go` | Go | Backend deposit routing, builds on `github.com/stellar/go/strkey`, zero new deps for Stellar Go shops |
| `stellar_address_kit` | Dart / Flutter | Wallet applications |
| `@stellar-address-kit/spec` |, | Shared spec artifact (`vectors.json` + `schema.json`) |

All three language implementations are validated against the same `spec/vectors.json`. If a vector passes in TypeScript, it passes identically in Go and Dart. The spec lives at `spec/` in the repo root, it is the source of truth.

> **Note:** Packages are not yet published to any registry. This project is under active development. Clone the repo to explore the implementations locally.


## Routing Reference

| Scenario | routingSource | Warnings | Recommended Action |
|----------|--------------|----------|--------------------|
| M address, no memo | muxed |, | Route via muxed ID |
| M address + routing memo also present | muxed | MEMO_PRESENT_WITH_MUXED (warn) | Route muxed, investigate sender |
| M address + harmless memo | muxed | MEMO_IGNORED_FOR_MUXED (info) | Route muxed |
| G address + MEMO_ID | memo |, | Route via memo ID |
| G address + MEMO_ID with leading zeros | memo | NON_CANONICAL_ROUTING_ID (warn) + normalization payload | Route normalized value, log |
| G address + MEMO_ID invalid format (empty, non-numeric, overflow) | none | MEMO_ID_INVALID_FORMAT (warn) | Manual review |
| G address + numeric MEMO_TEXT | memo |, | Route via parsed ID |
| G address + MEMO_TEXT with leading zeros | memo | NON_CANONICAL_ROUTING_ID (warn) + normalization payload | Route normalized value, log |
| G address + non-numeric MEMO_TEXT | none | MEMO_TEXT_UNROUTABLE (warn) | Manual review |
| G address + MEMO_HASH or MEMO_RETURN | none | UNSUPPORTED_MEMO_TYPE (warn) | Manual review |
| G address + no memo | none |, | Manual review |
| Unknown memoType string | none | UNSUPPORTED_MEMO_TYPE (warn) with `context: { memoType: 'unknown' }` | Manual review |
| Contract sender + no routing ID | none | CONTRACT_SENDER_DETECTED + INVALID_DESTINATION (error) | Alert immediately |
| C address as destination | none | INVALID_DESTINATION (error) | Alert immediately, always |
| Unparseable destination | none |, | destinationError.code explains why |


## Warning System

Warnings are separated by ontology. `ErrorCode` means the input could not be parsed, carried in `destinationError`, never in `warnings[]`. `WarningCode` means the input parsed successfully but requires operational attention, carried in `warnings[]`, never in `destinationError`.

```typescript
// Warning is a discriminated union, fields are stable per code.
// No free-form maps. No optional keys that vary by implementation.
type Warning =
  | {
      code: "NON_CANONICAL_ADDRESS" | "NON_CANONICAL_ROUTING_ID";
      severity: "warn";
      message: string;
      normalization: { original: string; normalized: string };
    }
  | {
      code: "INVALID_DESTINATION";
      severity: "error";
      message: string;
      context: { destinationKind: "C" };
    }
  | {
      code: "UNSUPPORTED_MEMO_TYPE";
      severity: "warn";
      message: string;
      context: { memoType: "hash" | "return" | "unknown" };
    }
  | {
      code: Exclude<
        WarningCode,
        | "NON_CANONICAL_ADDRESS"
        | "NON_CANONICAL_ROUTING_ID"
        | "INVALID_DESTINATION"
        | "UNSUPPORTED_MEMO_TYPE"
      >;
      severity: "info" | "warn" | "error";
      message: string;
    };
```

**Severity meanings:**
- `info`, informational, no action needed
- `warn`, log and investigate
- `error`, reject the deposit and alert ops immediately

`destinationError` invariant: when `destinationError` is present, `destinationBaseAccount` is null, `routingId` is null, `routingSource` is `'none'`, and `warnings` is empty. No partial population. Check `destinationError` as a single gate before inspecting any other field.


## Common Integration Mistakes

**Assuming valid StrKey means valid payment destination**
A C address (`CA7...`) is a valid StrKey but is treated as `INVALID_DESTINATION` for classic payment routing. `extractRouting` always returns `INVALID_DESTINATION` at `severity: 'error'` for C address destinations, unconditionally, regardless of sender.

**Using JavaScript `Number` for muxed IDs**
Muxed IDs are uint64. `Number` silently loses precision above 2^53. The library uses `string` for all public `routingId` fields. Use `result.routingIdAsBigInt()` for arithmetic. The spec includes a 2^53+1 canary vector (`id: "9007199254740993"`) that fails any implementation using `Number` coercion internally.

**Treating MEMO_TEXT as always routable**
`MEMO_TEXT` is only routable if the value is a non-negative decimal integer in `[0, 2^64-1]` with no whitespace, sign, or decimal characters. Leading zeros are accepted and normalized, `"007"` routes as `"7"` with a `NON_CANONICAL_ROUTING_ID` warning. Non-numeric text like `"ref:ABC123"` returns `routingSource: 'none'` with `MEMO_TEXT_UNROUTABLE`.

**Treating all warnings as equivalent**
`warnings[]` has three urgency levels. `info` is noise. `warn` should be logged. `error` should trigger an immediate alert and deposit rejection. Treating all warnings the same will either flood alerting or miss real deposit failures.

**Assuming MEMO_ID is always valid**
`MEMO_ID` values are normalized using the same rules as numeric `MEMO_TEXT`. An empty, non-numeric, or out-of-uint64-range `MEMO_ID` returns `routingSource: 'none'` with `MEMO_ID_INVALID_FORMAT`. The presence of `memoType: 'id'` in a transaction does not guarantee a routable ID exists.

**Passing non-standard memoType strings**
`memoType` is `string` at the spec boundary. Anything not in `['none', 'id', 'text', 'hash', 'return']`, including `'MemoID'`, `'ID'`, `'memo_id'`, or an empty string, emits `UNSUPPORTED_MEMO_TYPE` with `routingSource: 'none'`. It never throws. Map your transaction's memo type to a known value before calling `extractRouting` if you want deterministic routing.


## The Spec

Every behavior in this library is encoded in `spec/vectors.json` and validated against `spec/schema.json`. The schema enforces the discriminated union structure of warnings using JSON Schema `oneOf` with `additionalProperties: false` per variant, contributors cannot add undocumented fields, attach normalization to a warning code that doesn't carry it, or use the wrong severity value for a given code.

`spec_version` governs all three language packages simultaneously:

- **Patch**, new vectors testing existing behavior, doc clarifications
- **Minor**, new `WarningCode`, new `ErrorCode`, new output field, new optional input field
- **Major**, changed meaning of existing code, removed code, changed `RoutingInput` or `RoutingResult` shape

The spec artifact will be published independently once released, so teams can pin to a spec version and run vectors against their own integration layer. During development, import directly from `spec/` in the repo root:

```typescript
import vectors from "./spec/vectors.json";
import schema from "./spec/schema.json";
```


## Contributing

### Adding a vector

Vectors are the primary contribution path. If you encounter an edge case not covered by the current suite:

1. Add a case to `spec/vectors.json` following the schema
2. Run `node spec/validate.js`, must pass before any code changes
3. Update all three language implementations to pass the new case
4. Open a PR with changeset type `patch`

The schema enforces structure. Wrong warning codes, missing required fields, undocumented context keys, or wrong severity for a given code all fail validation before CI runs.

### Running the full suite locally

```bash
# Validate spec first, always runs before any language tests in CI
node spec/validate.js

# TypeScript
cd packages/core-ts && pnpm test

# Go
cd packages/core-go && go test ./...

# Dart
cd packages/core-dart && dart test

# Go fuzz (optional, runs for 5 minutes)
cd packages/core-go && go test -fuzz=. -fuzztime=300s ./spec/...

# Spec version sync check, fails if packages declare different spec_version
node scripts/check-vectors-sync.js
```


## Spec Compliance

The following vectors are the non-negotiable baseline for any compliant implementation:

| Vector | Why It Matters |
|--------|---------------|
| `id: "9007199254740993"`, 2^53+1 canary | Catches any Number coercion, runs on every commit for all three languages |
| `id: "18446744073709551615"`, uint64 max | Confirms full range is handled |
| `id: "18446744073709551616"`, uint64 overflow | Confirms overflow is rejected, not wrapped |
| Lowercase address input | Confirms output address field is always uppercase |
| `"NOTANADDRESS"` → UNKNOWN_PREFIX | Confirms prefix detection fires before checksum check |
| Tampered G-length string → INVALID_CHECKSUM | Deterministic checksum failure independent of parser path |
| C address as destination → INVALID_DESTINATION error | Confirms valid StrKey ≠ valid payment destination |
| `destinationError` present → all other fields null/none/empty | Confirms invariant is unconditional |


## Glossary

| Term | Definition |
|------|-----------|
| G address | Classic Stellar account. 56-character StrKey starting with G. |
| M address | Muxed account. A G address + 64-bit integer ID embedded into a single string starting with M. Replaces memo for deposit routing when memo is unavailable. |
| C address | Soroban contract address starting with C. Valid StrKey, but treated as INVALID_DESTINATION by this library for classic payment routing. |
| muxed ID | The 64-bit integer embedded in an M address. The routing identifier when `routingSource` is `'muxed'`. |
| routingSource | How `extractRouting` found the routing identifier: `'muxed'` (M address), `'memo'` (MEMO_ID or numeric MEMO_TEXT), `'none'` (no routable identifier). |
| MEMO_ID | Numeric Stellar memo type. Canonical routing identifier for classic deposit flows. |
| MEMO_TEXT | Text Stellar memo type. Routable only if strictly a non-negative integer within uint64 range. Leading zeros are accepted and normalized with a warning. |
| MEMO_HASH / MEMO_RETURN | Non-routing memo types. Always `routingSource: 'none'`. |
| ErrorCode | Returned when input cannot be parsed. In `destinationError`. Never in `warnings[]`. |
| WarningCode | Returned when input parsed successfully but requires attention. In `warnings[]`. Never in `destinationError`. |


## Design Principles

**Never throw on arbitrary input.** Every public function in all three languages is contractually non-throwing for any string input. Errors are values. `parse()` returns a result type. `parseOrThrow()` exists in Dart as a named opt-in for callers who prefer exception style, the spec guarantee covers only `parse()`.

**Errors and warnings are different ontologies.** `ErrorCode` means unparseable. `WarningCode` means parseable but notable. They never appear in each other's fields. This is enforced at the type level in all three languages, not by convention.

**Output is always canonical.** Returned address fields are always uppercase regardless of input casing. Returned `routingId` values are always canonical decimal strings without leading zeros (except `'0'`). Non-canonical input is accepted and flagged with a normalization payload showing exactly what changed.

**The spec is the product.** `vectors.json` defines what the library does. Implementations exist to pass it. New behaviors are added to `vectors.json` first, then implemented, never the reverse.


## SDK Relationship

This library wraps, not replaces the Stellar SDK.

- **TypeScript:** built on `@stellar/stellar-sdk` (StrKey, MuxedAccount, Address)
- **Go:** built on `github.com/stellar/go/strkey`, zero new dependencies for any Stellar Go shop
- **Dart:** wraps `stellar_flutter_sdk` where it handles uint64 correctly on Flutter Web; implements directly from SEP-0023 where it does not (verified against the 2^53+1 canary vector at build time)

When the SDK improves its primitives, this library gets better for free. The SDK will never ship `extractRouting`. That is the boundary.


## Status

| Component | Status |
|-----------|--------|
| spec/vectors.json | In development |
| stellar-address-kit (TypeScript) | In development |
| core-go (Go) | In development |
| stellar_address_kit (Dart) | In development |
| @stellar-address-kit/spec | In development |

> This project is under active development. No packages have been published yet. Contributions, feedback, and early integration interest are welcome.


## License

MIT, see [LICENSE](./LICENSE)


## Acknowledgements

Built on top of:

- [Stellar SDK](https://github.com/stellar/js-stellar-sdk), StrKey, MuxedAccount, Address primitives
- [stellar/go/strkey](https://github.com/stellar/go-stellar-sdk/tree/main/strkey), Go StrKey and muxed account implementation
- [SEP-0023](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md), StrKey encoding format specification
- [CAP-0027](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0027.md), Muxed account protocol-level definition
