package spec

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/stellar-address-kit/core-go/address"
	"github.com/stellar-address-kit/core-go/muxed"
)

type VectorCase struct {
	Module      string                 `json:"module"`
	Description string                 `json:"description"`
	Input       map[string]interface{} `json:"input"`
	Expected    map[string]interface{} `json:"expected"`
}

type Vectors struct {
	Cases []VectorCase `json:"cases"`
}

func vectorTestName(index int, tc VectorCase) string {
	description := strings.TrimSpace(tc.Description)
	if description == "" {
		description = "unnamed vector"
	}

	// Keep the label readable in `go test` output while avoiding path-like nesting.
	description = strings.ReplaceAll(description, "/", "-")
	return fmt.Sprintf("%03d_%s_%s", index, tc.Module, description)
}

func TestVectors(t *testing.T) {
	f, err := os.Open("../../../spec/vectors.json")
	if err != nil {
		t.Fatalf("failed to open vectors.json: %v", err)
	}
	defer f.Close()

	var v Vectors
	dec := json.NewDecoder(f)
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("failed to unmarshal vectors.json: %v", err)
	}

	for i, tc := range v.Cases {
		tc := tc
		name := vectorTestName(i, tc)

		t.Run(name, func(t *testing.T) {
			t.Logf("vector=%s", name)

			switch tc.Module {
			case "muxed_encode":
				baseG := tc.Input["base_g"].(string)
				idStr := fmt.Sprintf("%v", tc.Input["id"])

				res, err := muxed.EncodeMuxed(baseG, idStr)
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res != tc.Expected["mAddress"].(string) {
					t.Errorf("Expected %s, got %s", tc.Expected["mAddress"], res)
				}

			case "muxed_decode":
				mAddr := tc.Input["mAddress"].(string)
				baseG, id, err := muxed.DecodeMuxed(mAddr)
				
				if tc.Expected["expected_error"] != nil {
					if err == nil {
						t.Errorf("expected error, got none")
					}
				} else {
					if err != nil {
						t.Fatalf("unexpected error: %v", err)
					}
					if baseG != tc.Expected["base_g"].(string) {
						t.Errorf("Expected baseG %s, got %s", tc.Expected["base_g"], baseG)
					}
					
					expID := fmt.Sprintf("%v", tc.Expected["id"])
					if id != expID {
						t.Errorf("Expected id %s, got %s", expID, id)
					}
				}

			case "detect":
				addr := tc.Input["address"].(string)
				kind, err := address.Detect(addr)
				if tc.Expected["kind"] != nil {
					if err != nil {
						t.Fatalf("unexpected error: %v", err)
					}
					if string(kind) != tc.Expected["kind"].(string) {
						t.Errorf("Expected kind %s, got %s", tc.Expected["kind"], kind)
					}
				} else {
					// Should probably return error or unknown
					if err == nil && kind != "" {
						t.Errorf("expected error or empty kind for invalid address")
					}
				}
			}
		})
	}
}
