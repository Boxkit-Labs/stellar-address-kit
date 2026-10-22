# stellar-address-kit (Go)

The Go implementation of the Stellar Address Kit for high-performance deposit routing and address interop.

```bash
go get github.com/Boxkit-Labs/stellar-address-kit/packages/core-go
```

Part of a multi-language suite also available in **[TypeScript](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-ts)** and **[Dart](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-dart)**.

---

### 📖 Documentation & Guides
- [Go: Deposit Routing Service Integration](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/go-deposit-routing-service.md)
- [Go: Running the Spec Validator](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/go-running-spec-validator.md)
- [General: Compatibility Reference](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/compatibility-reference.md)

---

## Quick Start

```go
package main

import (
	"fmt"
	addresskit "github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/routing"
)

func main() {
	// Validate and detect address types
	addr := "GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU"
	if addresskit.IsValid(addr) {
		kind := addresskit.Detect(addr)
		fmt.Printf("Address kind: %s\n", kind)
	}

	// Extract routing information from an incoming payment
	result := routing.ExtractRouting(routing.RoutingInput{
		Destination: "MA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU...",
		MemoType:    "none",
	})
	
	fmt.Printf("Routing ID: %s\n", result.RoutingID)
}
```

## SEP-0029 Memo Requirement Checking

Exchanges can require a memo on deposits (SEP-0029). Query Horizon for a
destination's `config.memo_required` / `config.requiring_memo` data entries,
or wrap `ExtractRouting` with the async variant that appends the
`MISSING_REQUIRED_MEMO` error warning when a memo is required but missing:

```go
// Convenience lookup against the default Horizon endpoint (10s timeout).
required, err := routing.FetchMemoRequirement("GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU")

// Non-blocking wrapper: the result arrives on a channel and the Horizon
// lookup honours context cancellation.
ctx := context.Background()
result := <-routing.ExtractRoutingAsync(ctx, routing.RoutingInput{
	Destination: "GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU",
	MemoType:    "none",
})
for _, warning := range result.Warnings {
	if warning.Code == address.WarnMissingRequiredMemo {
		fmt.Println("destination requires a memo, but none was provided")
	}
}
```

Both functions accept functional options (`routing.WithHTTPClient`,
`routing.WithHorizonURL`) for custom Horizon deployments such as testnet.
Network and configuration failures fail open: the synchronous routing result
is returned unchanged.

## Examples

### Complete Payment Listener
For a production-ready example of a background worker that listens for payments on the Stellar network and routes them using this kit, see the [go-payment-listener](../../examples/go-payment-listener) in the root repository.

## Documentation

For integration guides and detailed Go examples, see the [Go Guides](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/docs/guides).

## License

MIT
