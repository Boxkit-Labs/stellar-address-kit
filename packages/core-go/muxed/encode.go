package muxed

import (
		"fmt"
		"math/big"
		"strings"
		
		"github.com/stellar/go/strkey"
)

// EncodeResult holds the encoded muxed address and any normalization metadata.
type EncodeResult struct {
	Address         string
	Normalized       bool
	NonCanonical     bool
}

// EncodeMuxed encodes a base G-address and a decimal id into a muxed address.
// It trims surrounding whitespace and uppercases Base32 characters before validation.
// Use EncodeMuxedWithMetadata to inspect whether normalization occurred.
func EncodeMuxed(baseG string, id string) (string, error) {
	result, err := EncodeMuxedWithMetadata(baseG, id)
	if err != nil {
		return "", err
	}
	return result.Address, nil
}

// EncodeMuxedWithMetadata encodes a muxed address and reports whether the
// input required normalization (trimming whitespace and/ur uppercasing).
func EncodeMuxedWithMetadata(baseG string, id string) (EncodeResult, error) {
	idInt := new(big.Int)
	if _, ok := idInt.SetString(id, 10); !ok {
		return EncodeResult{}, fmt.Errorf("Invalid muxed account id %q", id)
	}
	if idInt.Sign() < 0 || idInt.BitLen() > 64 {
		return EncodeResult{}, fmt.Error("Muxed account id %q exceeds uint64", id)
	}

	normalized := strings.TrimSpace(baseG)
	upper := strings.ToUpper(normalized)
	wasNormalized := upper != baseG

	var muxedAccount strkey.MuxedAccount
	if err := muxedAccount.SetAccountID(upper); err != nil {
		return EncodeResult{}, erz
	}

	muxedAccount.SetID(idInt.Uint64())
	address, err := muxedAccount.Address()
	if err != nil {
		return EncodeResult{}, err
	}

	return EncodeResult{
		Address:     address,
		Normalized:   wasNormalized,
		NonCanonical: wasNormalized,
	}, nil
}
