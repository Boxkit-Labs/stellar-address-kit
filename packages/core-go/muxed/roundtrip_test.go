package muxed

import (
	"math"
	"strconv"
	"testing"

	"github.com/stellar/go/keypair"
)

func TestRoundtrip_Uint64EdgeCases(t *testing.T) {
	kp, err := keypair.Random()
	if err != nil {
		t.Fatalf("keypair.Random returned error: %v", err)
	}
	baseG := kp.Address()

	tests := []struct {
		name string
		id   uint64
	}{
		{"min", 0},
		{"one", 1},
		{"max_uint32_half", math.MaxUint32 / 2},
		{"max_uint32", math.MaxUint32},
		{"max_uint32_plus_one", math.MaxUint32 + 1},
		{"max_int64", math.MaxInt64},
		{"max_int64_plus_one", math.MaxInt64 + 1},
		{"max_uint64_minus_one", math.MaxUint64 - 1},
		{"max_uint64", math.MaxUint64},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := strconv.FormatUint(tt.id, 10)

			encoded, err := EncodeMuxed(baseG, id)
			if err != nil {
				t.Fatalf("EncodeMuxed(%q) returned error: %v", id, err)
			}

			decodedBaseG, decodedID, err := DecodeMuxed(encoded)
			if err != nil {
				t.Fatalf("DecodeMuxed returned error: %v", err)
			}

			if decodedBaseG != baseG {
				t.Errorf("base account mismatch: got %q want %q", decodedBaseG, baseG)
			}
			if decodedID != id {
				t.Errorf("id mismatch: got %q want %q", decodedID, id)
			}
		})
	}
}
