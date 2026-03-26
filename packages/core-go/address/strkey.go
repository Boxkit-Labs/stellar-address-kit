package address

import (
	"encoding/base32"
	"strings"
)

const (
	VersionByteG = 6 << 3
	VersionByteM = 12 << 3
	VersionByteC = 2 << 3

	VersionByteAccountID    = VersionByteG
	VersionByteMuxedAccount = VersionByteM
	VersionByteContract     = VersionByteC
)

// DecodeStrKey decodes a strkey address and returns version byte and payload.
func DecodeStrKey(address string) (versionByte byte, payload []byte, err error) {
	if address == "" {
		return 0, nil, ErrInvalidLengthError
	}

	// Convert to uppercase for base32 decoding.
	address = strings.ToUpper(address)

	// Check basic length constraints.
	if len(address) < 3 {
		return 0, nil, ErrInvalidLengthError
	}

	// Base32 decode without padding.
	decoder := base32.StdEncoding.WithPadding(base32.NoPadding)
	decoded, err := decoder.DecodeString(address)
	if err != nil {
		return 0, nil, ErrInvalidBase32Error
	}

	// Verify round-trip encoding to catch invalid inputs.
	reencoded := decoder.EncodeToString(decoded)
	if reencoded != address {
		return 0, nil, ErrInvalidBase32Error
	}

	// Minimum length: version byte (1) + payload (at least 1) + checksum (2).
	if len(decoded) < 4 {
		return 0, nil, ErrInvalidLengthError
	}

	// Extract version byte, payload, and checksum.
	versionByte = decoded[0]
	payload = decoded[:len(decoded)-2]
	checksum := decoded[len(decoded)-2:]

	// Validate version byte.
	switch versionByte {
	case VersionByteG, VersionByteM, VersionByteC:
	default:
		return 0, nil, ErrUnknownVersionByteError
	}

	// Calculate and verify checksum.
	expectedCRC := CalculateCRC16(payload)
	expectedChecksum := []byte{byte(expectedCRC & 0xff), byte((expectedCRC >> 8) & 0xff)}

	if checksum[0] != expectedChecksum[0] || checksum[1] != expectedChecksum[1] {
		return 0, nil, ErrInvalidChecksumError
	}

	// Return payload without version byte.
	return versionByte, payload[1:], nil
}

// EncodeStrKey encodes a payload with a version byte and checksum.
func EncodeStrKey(versionByte byte, payload []byte) (string, error) {
	versionedPayload := make([]byte, 1+len(payload))
	versionedPayload[0] = versionByte
	copy(versionedPayload[1:], payload)

	crc := CalculateCRC16(versionedPayload)
	checksum := []byte{byte(crc & 0xff), byte((crc >> 8) & 0xff)}

	fullPayload := append(versionedPayload, checksum...)

	encoder := base32.StdEncoding.WithPadding(base32.NoPadding)
	return encoder.EncodeToString(fullPayload), nil
}
