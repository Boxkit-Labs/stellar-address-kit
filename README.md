<p align="center">
  <img src="https://img.shields.io/badge/Stellar-Address_Kit-3E1BDB?style=for-the-badge" alt="Stellar Address Kit" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.1-blue?style=for-the-badge" alt="Version 1.0.1" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License MIT" />
  <img src="https://img.shields.io/badge/Documentation-Live-blue?style=for-the-badge&logo=gitbook&logoColor=white" alt="Docs" />
</p>

**Stellar Address Kit** is a specialized, multi-language library designed to solve the complexity of deposit routing on the Stellar network. It provides a unified, spec-compliant way to handle G-addresses (classic), M-addresses (muxed), and C-addresses (contracts) across TypeScript, Go, and Dart.

## Use Cases

- **Exchange Deposit Reconciliation**: Reliably identify incoming payments, correctly extracting the routing ID whether it arrives via a Muxed address or a standard Memo, while automatically flagging non-canonical formatting.
- **Wallet Address Input Forms**: Prevent users from making mistakes (like sending payments to a Contract address or entering a Memo alongside an M-address) with real-time UI warnings.
- **Compliance & Security Firewalls**: Automatically quarantine deposits from contract-senders or invalid destinations before they affect user balances.
- **Cross-Platform Parity**: Ensure identical deposit routing behavior whether your backend is written in Go, your frontend in TypeScript, or your mobile app in Flutter.

## Core Features

- **Spec-First Design**: Guaranteed identical behavior across all three languages via a shared test vector suite.
- **Precision Safety**: Built-in protection against 64-bit integer precision loss in JavaScript and Flutter Web.
- **Warning System**: Discriminated unions (TS) or structured objects (Go/Dart) to catch edge cases like numeric `MEMO_TEXT`.
- **Zero Dependencies**: Core logic is lightweight and has zero external dependencies beyond standard library features.

## Documentation

For full technical specifications, architecture deep-dives, and API references, visit our [Live Documentation](https://stellaraddresskit.mintlify.app/docs/introduction).

- **[Quickstart](https://stellaraddresskit.mintlify.app/docs/quickstart)**: Get running in under 60 seconds.
- **[Routing Logic](https://stellaraddresskit.mintlify.app/docs/concepts/routing-logic)**: Complete reference of all routing scenarios.
- **[Common Mistakes](https://stellaraddresskit.mintlify.app/docs/common-mistakes)**: Avoid the 6 most common integration pitfalls.
- **[Language Guides](https://stellaraddresskit.mintlify.app/docs/guides/go-deposit-routing)**: Specialized guides for Go, TypeScript, and Flutter.

## Packages

| Platform           | Package               | Install                                                              |
| ------------------ | --------------------- | -------------------------------------------------------------------- |
| **TypeScript**     | `stellar-address-kit` | `npm install stellar-address-kit`                                    |
| **Go**             | `core-go`             | `go get github.com/Boxkit-Labs/stellar-address-kit/packages/core-go` |
| **Dart / Flutter** | `stellar_address_kit` | `dart pub add stellar_address_kit`                                   |

## Quick Example

Extract canonical routing information from any address type (G, M, or C) with zero-throw safety.

```typescript
import { extractRouting } from "stellar-address-kit";

// Handles M-addresses, G-addresses with memos, and C-addresses
const result = extractRouting({
  address:
    "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLT7AV7Y6S33Z6S3CHBAAAAAAAAAAAAABQD",
});

console.log(result.address); // "GA7Q..."
console.log(result.routingId); // "123"
```

## Core Features

- **Spec-First Design**: Guaranteed identical behavior across all three languages via a shared test vector suite.
- **Precision Safety**: Built-in protection against 64-bit integer precision loss in JavaScript and Flutter Web.
- **Warning System**: Discriminated unions (TS) or structured objects (Go/Dart) to catch edge cases like numeric `MEMO_TEXT`.
- **Zero Dependencies**: Core logic is lightweight and has zero external dependencies beyond standard library features.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
