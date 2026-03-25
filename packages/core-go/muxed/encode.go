package muxed

import (
	"fmt"
	"math/big"

	"github.com/stellar/go/strkey"
)

func EncodeMuxed(baseG string, id string) (string, error) {
	idInt := new(big.Int)
	if _, ok := idInt.SetString(id, 10); !ok {
		return "", fmt.Errorf("invalid muxed account id %q", id)
	}
	if idInt.Sign() < 0 || idInt.BitLen() > 64 {
		return "", fmt.Errorf("muxed account id %q exceeds uint64", id)
	}

	var muxedAccount strkey.MuxedAccount
	if err := muxedAccount.SetAccountID(baseG); err != nil {
		return "", err
	}

	muxedAccount.SetID(idInt.Uint64())
	return muxedAccount.Address()
}
