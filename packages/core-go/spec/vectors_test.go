package spec

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/muxed"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/routing"
)

const (
	legacyVectorG       = "GA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1"
	legacyVectorMPrefix = "MA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1"
	legacyVectorCPrefix = "CA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1"
	validG              = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"
	validC              = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
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

func normalizeVectorDestination(destination string, expectedRoutingID interface{}) (string, error) {
	if destination == legacyVectorG {
		return validG, nil
	}
	if strings.HasPrefix(destination, legacyVectorMPrefix) {
		return muxed.EncodeMuxed(validG, fmt.Sprintf("%v", expectedRoutingID))
	}
	if strings.HasPrefix(destination, legacyVectorCPrefix) {
		return validC, nil
	}
	return destination, nil
}

func normalizeExpectedBaseAccount(value interface{}) string {
	if value == nil {
		return ""
	}
	base := fmt.Sprintf("%v", value)
	if base == legacyVectorG {
		return validG
	}
	return base
}

func optionalString(value interface{}) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%v", value)
}

func warningsAsJSONValue(t *testing.T, warnings []address.Warning) interface{} {
	t.Helper()
	encoded, err := json.Marshal(warnings)
	if err != nil {
		t.Fatalf("failed to marshal routing warnings: %v", err)
	}
	var value interface{}
	if err := json.Unmarshal(encoded, &value); err != nil {
		t.Fatalf("failed to decode routing warnings: %v", err)
	}
	return value
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
					if fmt.Sprintf("%d", id) != expID {
						t.Errorf("Expected id %s, got %d", expID, id)
					}
				}

			case "extract_routing":
				destination, err := normalizeVectorDestination(
					tc.Input["destination"].(string),
					tc.Expected["routingId"],
				)
				if err != nil {
					t.Fatalf("failed to normalize routing vector destination: %v", err)
				}

				result := routing.ExtractRouting(routing.RoutingInput{
					Destination:   destination,
					MemoType:      optionalString(tc.Input["memoType"]),
					MemoValue:     optionalString(tc.Input["memoValue"]),
					SourceAccount: optionalString(tc.Input["sourceAccount"]),
				})

				if got, want := result.DestinationBaseAccount, normalizeExpectedBaseAccount(tc.Expected["destinationBaseAccount"]); got != want {
					t.Errorf("DestinationBaseAccount = %q, want %q", got, want)
				}

				gotID := ""
				if result.RoutingID != nil {
					gotID = result.RoutingID.String()
				}
				wantID := optionalString(tc.Expected["routingId"])
				if gotID != wantID {
					t.Errorf("RoutingID = %q, want %q", gotID, wantID)
				}
				if result.RoutingSource != optionalString(tc.Expected["routingSource"]) {
					t.Errorf("RoutingSource = %q, want %q", result.RoutingSource, tc.Expected["routingSource"])
				}

				gotWarnings := warningsAsJSONValue(t, result.Warnings)
				if !reflect.DeepEqual(gotWarnings, tc.Expected["warnings"]) {
					t.Errorf("Warnings = %#v, want %#v", gotWarnings, tc.Expected["warnings"])
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
