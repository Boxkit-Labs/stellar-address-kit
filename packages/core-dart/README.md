# stellar-address-kit (Dart)

The Dart/Flutter implementation of the Stellar Address Kit for mobile and web wallet routing.

```yaml
dependencies:
  stellar_address_kit: ^1.0.1
```

Part of a multi-language suite also available in **[TypeScript](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-ts)** and **[Go](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-go)**.

---

### 📖 Documentation & Guides
- [Flutter: Displaying Deposit Addresses](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/flutter-displaying-deposit-addresses.md)
- [Flutter: Web BigInt Considerations](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/flutter-web-bigint.md)
- [General: Compatibility Reference](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/compatibility-reference.md)

---

## Quick Start

```dart
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  final address = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  
  if (validate(address)) {
    final kind = detect(address);
    print('Address kind: $kind');
    
    final parsed = StellarAddress.parse(address);
    print('Base G address: ${parsed.baseG}');
  }
}
```

## SEP-0029 Memo Requirement Checking

Exchanges can require a memo on deposits (SEP-0029). Query Horizon for a
destination's `config.memo_required` / `config.requiring_memo` data entries,
or use the async wrapper that appends the `MISSING_REQUIRED_MEMO` error
warning when a memo is required but missing:

```dart
import 'package:stellar_address_kit/stellar_address_kit.dart';

Future<void> main() async {
  final result = await extractRoutingAsync(
    RoutingInput(destination: account, memoType: 'none'),
  );
  if (result.warnings.any((w) => w.code == 'MISSING_REQUIRED_MEMO')) {
    print('Destination requires a memo, but none was provided.');
  }

  // Direct lookup against the default Horizon endpoint:
  final required = await fetchMemoRequirement(account);
}
```

`fetchMemoRequirement` accepts an injectable `http.Client` and Horizon base
URL for testnet or mock-based testing. Network and configuration failures
fail open: the synchronous routing result is returned unchanged.

## Examples

### Simple Dart Example
A basic example can be found in the [example/](example/) folder.

### Full Flutter Demo
For a complete integration in a Flutter application, including UI components for displaying deposit addresses and handling incoming payments, check out the [flutter-demo](../../examples/flutter-demo) in the root repository.

## Documentation

For deep dives into Flutter implementation and web BigInt considerations, see our [comprehensive Guides](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/docs/guides).

## License

MIT
