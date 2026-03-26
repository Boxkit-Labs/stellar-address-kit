package address

import (
	"encoding/base32"
	"strings"
	"testing"
)

func TestCalculateCRC16(t *testing.T) {
	tests := []struct {
		name    string
		address string
	}{
		{
			name:    "Valid G address",
			address: "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI",
		},
		{
			name:    "Valid M address with id=0",
			address: "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672",
		},
		{
			name:    "Valid M address with id=1",
			address: "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAHOO2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Decode the address to extract payload and checksum
			decoder := base32.StdEncoding.WithPadding(base32.NoPadding)
			decoded, err := decoder.DecodeString(strings.ToUpper(tt.address))
			if err != nil {
				t.Fatalf("failed to decode address: %v", err)
			}

			// Extract payload (everything except the last 2 checksum bytes)
			payload := decoded[:len(decoded)-2]

			// Extract the checksum bytes from the address
			checksumBytes := decoded[len(decoded)-2:]

			// Calculate CRC16 for the payload
			calculatedCRC := CalculateCRC16(payload)

			// Reconstruct the checksum as it is stored (little-endian: LSB first, then MSB)
			storedChecksum := uint16(checksumBytes[0]) | (uint16(checksumBytes[1]) << 8)

			// Verify the calculated CRC matches the stored checksum in the address
			if calculatedCRC != storedChecksum {
				t.Errorf("CRC16 mismatch for address %s:\n  calculated: 0x%04x\n  stored:      0x%04x",
					tt.address, calculatedCRC, storedChecksum)
			}
		})
	}
}

// TestCalculateCRC16WithKnownVectors verifies CRC16 calculation against known test vectors.
// These vectors represent the payload (version byte + data) that gets CRC-checked.
func TestCalculateCRC16WithKnownVectors(t *testing.T) {
	tests := []struct {
		name     string
		payload  []byte
		expected uint16
	}{
		{
			name:     "Empty payload",
			payload:  []byte{},
			expected: 0x0000,
		},
		{
			name:     "Single byte version G (0x30)",
			payload:  []byte{VersionByteG}, // 0x30
			expected: 0x3653,
		},
		{
			name:     "Single byte version M (0x60)",
			payload:  []byte{VersionByteM}, // 0x60
			expected: 0x6ca6,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculateCRC16(tt.payload)
			if result != tt.expected {
				t.Errorf("CRC16 mismatch:\n  payload:    %x\n  calculated: 0x%04x\n  expected:   0x%04x",
					tt.payload, result, tt.expected)
			}
		})
	}
}
