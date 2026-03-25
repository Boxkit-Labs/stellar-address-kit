package routing

import (
	"math/big"
	"regexp"
	"strings"

	"github.com/stellar-address-kit/core-go/address"
)

var digitsOnly = regexp.MustCompile(`^\d+$`)
var uint64Max, _ = new(big.Int).SetString("18446744073709551615", 10)

type NormalizeResult struct {
	Normalized string
	Warnings   []address.Warning
}

func NormalizeMemoTextID(s string) NormalizeResult {
	warnings := []address.Warning{}

	// Step 1: Whitespace - not trimmed.
	// Step 2: Empty string.
	// Step 3: Any non-digit character.
	if s == "" || !digitsOnly.MatchString(s) {
		return NormalizeResult{Normalized: "", Warnings: warnings}
	}

	// Step 4: Strip leading zeros
	normalized := strings.TrimLeft(s, "0")
	if normalized == "" {
		normalized = "0"
	}

	if normalized != s {
		warnings = append(warnings, address.Warning{
			Code:     address.WarnNonCanonicalRoutingID,
			Severity: "warn",
			Message:  "Memo routing ID had leading zeros. Normalized to canonical decimal.",
			Normalization: &address.Normalization{
				Original:   s,
				Normalized: normalized,
			},
		})
	}

	// Step 5: Check uint64 max
	val, ok := new(big.Int).SetString(normalized, 10)
	if !ok || val.Cmp(uint64Max) > 0 {
		return NormalizeResult{Normalized: "", Warnings: warnings}
	}

	return NormalizeResult{Normalized: normalized, Warnings: warnings}
}
