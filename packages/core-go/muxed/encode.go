package muxed

import (
	"encoding/binary"
	"fmt"
	"github.com/stellar-address-kit/core-go/address"
)

func EncodeMuxed(baseG string, id uint64) (string, error) {
	versionByte, pubkey, err := address.DecodeStrKey(baseG)
	if err != nil {
		return "", fmt.Errorf("invalid G address: %w", err)
	}
	if versionByte != address.VersionByteG {
		return "", fmt.Errorf("invalid G address")
	}

	payload := make([]byte, 40)
	copy(payload, pubkey)
	binary.BigEndian.PutUint64(payload[32:], id)

	return address.EncodeStrKey(address.VersionByteM, payload)
}