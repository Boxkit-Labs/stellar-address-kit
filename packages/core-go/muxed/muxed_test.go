package muxed

import (
	"encoding/json"
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

// TestEncodeMuxedWithJS53Boundary validates correct handling of 2^53 + 1 (9007199254740993),
// which is the JavaScript precision boundary where standard JSON number formatting fails.
// This test ensures the muxed account logic handles this boundary value safely without precision loss.
func TestEncodeMuxedWithJS53Boundary(t *testing.T) {
	kp, err := keypair.Random()
	if err != nil {
		t.Fatalf("keypair.Random returned error: %v", err)
	}

	baseG := kp.Address()
	// 2^53 + 1 = 9007199254740993 - JavaScript precision boundary
	boundaryID := "9007199254740993"

	encoded, err := EncodeMuxed(baseG, boundaryID)
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

	if decodedID != boundaryID {
		t.Fatalf("decoded id mismatch: got %q want %q", decodedID, boundaryID)
	}
}

// TestEncodeMuxedJSONUnmarshalWithJS53Boundary tests JSON unmarshaling with the 2^53 + 1 boundary value.
// This test injects {"id": 9007199254740993} and verifies the value is parsed correctly and safely.
func TestEncodeMuxedJSONUnmarshalWithJS53Boundary(t *testing.T) {
	kp, err := keypair.Random()
	if err != nil {
		t.Fatalf("keypair.Random returned error: %v", err)
	}

	baseG := kp.Address()
	// 2^53 + 1 = 9007199254740993
	boundaryID := uint64(9007199254740993)

	// Test with numeric JSON representation (breaks JS number parsing)
	payload := struct {
		ID uint64 `json:"id"`
	}{
		ID: boundaryID,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	// Unmarshal and verify
	var decoded struct {
		ID uint64 `json:"id"`
	}
	if err := json.Unmarshal(jsonBytes, &decoded); err != nil {
		t.Fatalf("json.Unmarshal returned error: %v", err)
	}

	if decoded.ID != boundaryID {
		t.Fatalf("decoded id mismatch: got %d want %d", decoded.ID, boundaryID)
	}

	// Verify the muxed account creation works with this ID
	boundaryIDStr := strconv.FormatUint(boundaryID, 10)
	encoded, err := EncodeMuxed(baseG, boundaryIDStr)
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

	if decodedID != boundaryIDStr {
		t.Fatalf("decoded id mismatch: got %q want %q", decodedID, boundaryIDStr)
	}
}
