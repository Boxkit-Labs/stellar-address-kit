package muxed

import (
	"math"
	"strconv"
	"testing"

	"github.com/stellar/go/keypair"
)

func TestEncodeDecodeMuxedIsLosslessForUint64Max(t *testing.T) {
	kp, err := keypair.Random()
	if err != nil {
		t.Fatalf("keypair.Random returned error: %v", err)
	}

	baseG := kp.Address()
	id := strconv.FormatUint(math.MaxUint64, 10)

	encoded, err := EncodeMuxed(baseG, id)
	if err != nil {
		t.Fatalf("EncodeMuxed returned error: %v", err)
	}

	decodedBaseG, decodedID, err := DecodeMuxed(encoded)
	if err != nil {
		t.Fatalf("DecodeMuxed returned error: %v", err)
	}

	if decodedBaseG != baseG {
		t.Fatalf("decoded base account mismatch: got %q want %q", decodedBaseG, baseG)
	}

	if decodedID != id {
		t.Fatalf("decoded id mismatch: got %q want %q", decodedID, id)
	}
}
