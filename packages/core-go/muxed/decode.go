package muxed

import (
	"encoding/binary"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

// DecodeMuxed extracts the base G-address and uint64 ID from a muxed
// M-address. The 64-bit ID is parsed directly from the big-endian payload
// using binary.BigEndian.Uint64, matching the Stellar protocol's native
// byte-aligned serialization.
func DecodeMuxed(mAddress string) (string, uint64, error) {
	versionByte, payload, err := address.DecodeStrKey(mAddress)
	if err != nil {
		return "", 0, &AddressError{
			Code:    ErrInvalidGAddress,
			Input:   mAddress,
			Message: "failed to decode muxed address",
			Cause:   err,
		}
	}

	if versionByte != address.VersionByteMuxedAccount {
		return "", 0, &AddressError{
			Code:    ErrUnknownVersionByte,
			Input:   mAddress,
			Message: "expected muxed account version byte",
		}
	}

	if len(payload) != 40 {
		return "", 0, &AddressError{
			Code:    ErrInvalidLength,
			Input:   mAddress,
			Message: "muxed payload must be 40 bytes",
		}
	}

	pubkey := payload[:32]
	id := binary.BigEndian.Uint64(payload[32:40])

	baseG, err := address.EncodeStrKey(address.VersionByteAccountID, pubkey)
	if err != nil {
		return "", 0, &AddressError{
			Code:    ErrInvalidGAddress,
			Input:   mAddress,
			Message: "failed to encode base G-address",
			Cause:   err,
		}
	}

	return baseG, id, nil
}
