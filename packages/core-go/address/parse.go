package address

import (
	"encoding/binary"
	"strings"
)

// Parse parses a Stellar address into an Address struct.
//
// For muxed accounts (M-addresses), BaseG and MuxedID are populated.
// For other kinds, BaseG will be empty and MuxedID will be zero.
func Parse(input string) (*Address, error) {
	kind, err := Detect(input)
	if err != nil {
		code := ErrUnknownPrefix
		switch err {
		case ErrInvalidChecksumError:
			code = ErrInvalidChecksum
		case ErrInvalidBase32Error:
			code = ErrInvalidBase32
		case ErrInvalidLengthError:
			code = ErrInvalidLength
		case ErrUnknownVersionByteError:
			code = ErrUnknownPrefix
		}

		return nil, &AddressError{
			Code:    code,
			Input:   input,
			Message: err.Error(),
		}
	}

	raw := strings.ToUpper(input)

	addr := &Address{
		Kind: kind,
		Raw:  raw,
	}

	// For muxed accounts, also populate BaseG and MuxedID.
	if kind == KindM {
		versionByte, payload, err := DecodeStrKey(raw)
		if err != nil {
			return nil, err
		}
		if versionByte != VersionByteM {
			return nil, ErrUnknownVersionByteError
		}

		if len(payload) != 40 {
			return nil, ErrInvalidLengthError
		}

		pubkey := payload[:32]
		id := binary.BigEndian.Uint64(payload[32:40])

		baseG, err := EncodeStrKey(VersionByteG, pubkey)
		if err != nil {
			return nil, err
		}

		addr.BaseG = baseG
		addr.MuxedID = id
	}

	return addr, nil
}

