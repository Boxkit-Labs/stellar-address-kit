package muxed

import (
	"encoding/binary"
	"strconv"

	"github.com/stellar-address-kit/core-go/address"
)

func DecodeMuxed(mAddress string) (string, string, error) {
	versionByte, payload, err := address.DecodeStrKey(mAddress)
	if err != nil {
		return "", "", err
	}

	if versionByte != address.VersionByteM {
		return "", "", ErrUnknownVersionByteError
	}

	// For muxed accounts, payload is: 32-byte pubkey + 8-byte memo ID
	if len(payload) != 40 {
		return "", "", ErrInvalidLengthError
	}

	// Extract the 32-byte public key
	pubkey := payload[:32]

	// Extract the 8-byte memo ID (big endian)
	memoID := binary.BigEndian.Uint64(payload[32:40])

	// Encode the public key as a G address
	baseG, err := address.EncodeStrKey(address.VersionByteG, pubkey)
	if err != nil {
		return "", "", err
	}

	return baseG, strconv.FormatUint(memoID, 10), nil
}
