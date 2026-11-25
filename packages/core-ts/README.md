# stellar-address-kit (TypeScript)

The TypeScript reference implementation of the Stellar Address Kit for secure deposit routing and address interop.

```bash
npm install stellar-address-kit
```

Part of a multi-language suite also available in **[Go](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-go)** and **[Dart](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-dart)**.

---

### 📖 Documentation & Guides
- [TypeScript: Reconciling Deposits with Missing Memos](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/reconciling-deposits-missing-memo.md)
- [TypeScript: Pooled Accounts & Muxed Deposits](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/pooled-accounts-muxed-deposits.md)
- [General: Compatibility Reference](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/compatibility-reference.md)

---

## Quick Start

```typescript
import { extractRouting } from 'stellar-address-kit';

const result = extractRouting({
  destination: 'MA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQUVRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRTD6',
  memoType: 'none',
  memoValue: null,
  sourceAccount: 'GA...'
});

if (!result.destinationError) {
  console.log('Routing ID:', result.routingId); // "123456789"
  console.log('Source:', result.routingSource); // "muxed"
}
```

## CLI: `stellar-route`

Inspect one deposit, or stream a whole batch of deposit logs and get
machine-readable results on stdout.

### Single address

```bash
stellar-route --dest GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU --type id --memo 123
```

Prints one pretty-printed `RoutingResult` as JSON.

### Batch mode

```bash
# CSV file
stellar-route --file deposits.csv

# JSON array file
stellar-route --file deposits.json

# NDJSON file
stellar-route --file deposits.ndjson

# Any of the above, piped in
cat deposits.csv | stellar-route --stdin
```

Batch mode writes **one compact JSON object per line** (NDJSON) to stdout:

```json
{"index":0,"line":2,"status":"ok","destination":"GA7QY...","memoType":"id","memoValue":"123","sourceAccount":null,"result":{"destinationBaseAccount":"GA7QY...","routingId":"123","routingSource":"memo","warnings":[]}}
{"index":1,"line":3,"status":"error","destination":"not-an-address","memoType":"none","memoValue":null,"sourceAccount":null,"result":{"destinationBaseAccount":null,"routingId":null,"routingSource":"none","warnings":[],"destinationError":{"code":"UNKNOWN_PREFIX","message":"Invalid address"}}}
```

`routingId` values that exceed `Number.MAX_SAFE_INTEGER` are emitted as
strings, so uint64 memo ids keep full precision.

### Accepted input fields

CSV headers and JSON keys are matched case-insensitively, with `_`, `-`, and
`camelCase` treated as equivalent:

| Canonical field | Accepted names |
| --- | --- |
| destination | `destination`, `address`, `dest`, `to`, `account`, `destination_address`, `stellar_address`, `recipient` |
| memo type | `memo_type`, `type`, `memo_kind` (`none`, `id`, `text`, `hash`, `return`) |
| memo value | `memo`, `memo_value`, `memo_id`, `memo_text`, `routing_id` |
| source account | `source_account`, `source`, `from`, `sender`, `sender_account` |

When a row supplies a memo but no memo type, `text` is assumed (numeric memo
text still routes).

Formats are auto-detected from the file extension or, for stdin, from the
first non-whitespace character (`[` = JSON array, `{` = NDJSON, otherwise
CSV). Override with `--format csv|json|ndjson`.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every record routed without errors (warnings may still be present). |
| `1` | Invalid CLI usage, unreadable input, or at least one record failed to parse, failed to route, or produced an `error`-severity warning. |

Batch processing never stops on a bad row: the failure is emitted as an
`error` record and the remaining rows still stream out, which makes the output
usable for reconciliation even when part of the input is broken.

## Documentation

For full guides, integration examples, and deep dives into the routing logic, see our [comprehensive Guides](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/docs/guides).

## License

MIT
