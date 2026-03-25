package muxed

import (
	"encoding/binary"
	"github.com/stellar-address-kit/core-go/address"
)

func EncodeMuxed(baseG string, id uint64) (string, error) {
	versionByte, pubkey, err := address.DecodeStrKey(baseG)
	if err != nil {
		return "", NewInvalidGAddressError(err)
	}
	if versionByte != address.VersionByteG {
		return "", ErrInvalidGAddressError
	}

	payload := make([]byte, 40)
	copy(payload, pubkey)
	binary.BigEndian.PutUint64(payload[32:], id)

	return address.EncodeStrKey(address.VersionByteM, payload)
}