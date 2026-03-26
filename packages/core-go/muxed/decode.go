package muxed

import (
	"strconv"

	"github.com/stellar/go/strkey"
)

func DecodeMuxed(mAddress string) (string, string, error) {
	muxedAccount, err := strkey.DecodeMuxedAccount(mAddress)
	if err != nil {
		return "", "", err
	}

	baseG, err := muxedAccount.AccountID()
	if err != nil {
		return "", "", err
	}

	return baseG, strconv.FormatUint(muxedAccount.ID(), 10), nil
}
