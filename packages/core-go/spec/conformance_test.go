package spec

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/muxed"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/routing"
)

// Cross-platform conformance checks that sit on top of TestSpecVectors.
// TestSpecVectors replays every vector; this file guards what a replay cannot
// notice on its own: that no vector module is silently skipped, that the
// 2^53+1 canary survives, and that the canonicalization invariants hold for
// every routing result. It mirrors packages/core-ts/src/spec/conformance.test.ts
// and packages/core-dart/test/spec_conformance_test.dart.

const (
	vectorsPath = "../../../spec/vectors.json"

	canary    = "9007199254740993" // 2^53 + 1
	maxUint64 = "18446744073709551615"
)

var (
	knownModules       = []string{"detect", "muxed_encode", "muxed_decode", "extract_routing"}
	canonicalRoutingID = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)
	numericIDInJSON    = regexp.MustCompile(`"(id|routingId)"\s*:\s*-?\d`)
)

type taggedCase struct {
	VectorCase
	Tags []string `json:"tags"`
}

func readVectors(t *testing.T) ([]byte, []taggedCase) {
	t.Helper()
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("failed to read vectors.json: %v", err)
	}
	var doc struct {
		Cases []taggedCase `json:"cases"`
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	if err := dec.Decode(&doc); err != nil {
		t.Fatalf("failed to decode vectors.json: %v", err)
	}
	return raw, doc.Cases
}

func contains(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

func TestSpecEveryVectorUsesAKnownModule(t *testing.T) {
	_, cases := readVectors(t)
	if len(cases) == 0 {
		t.Fatal("vectors.json has no cases")
	}
	for i, c := range cases {
		if !contains(knownModules, c.Module) {
			t.Errorf("vector %d (%q) uses module %q, which this harness cannot run", i, c.Description, c.Module)
		}
	}
	for _, module := range knownModules {
		found := false
		for _, c := range cases {
			if c.Module == module {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("no vector for module %q", module)
		}
	}
}

func TestSpecCoversPositiveNegativeAndEdgeVectors(t *testing.T) {
	_, cases := readVectors(t)
	for _, tag := range []string{"positive", "negative", "edge"} {
		found := false
		for _, c := range cases {
			if contains(c.Tags, tag) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("no vector tagged %q", tag)
		}
	}
}

func TestSpecWritesSixtyFourBitIDsAsStrings(t *testing.T) {
	raw, _ := readVectors(t)
	if loc := numericIDInJSON.FindIndex(raw); loc != nil {
		t.Errorf("vectors.json holds a bare numeric id near %q; ids must be strings so no parser rounds them", raw[loc[0]:loc[1]])
	}
}

func TestSpecCanaryIsInEncodeDecodeAndRoutingVectors(t *testing.T) {
	_, cases := readVectors(t)
	seen := map[string]bool{}
	for _, c := range cases {
		encoded, err := json.Marshal(c.VectorCase)
		if err != nil {
			t.Fatalf("marshal vector: %v", err)
		}
		if strings.Contains(string(encoded), `"`+canary+`"`) {
			seen[c.Module] = true
		}
	}
	for _, module := range []string{"muxed_encode", "muxed_decode", "extract_routing"} {
		if !seen[module] {
			t.Errorf("no %s vector carries the 2^53+1 canary", module)
		}
	}
}

func TestSpecCanarySurvivesEncodeDecode(t *testing.T) {
	// Sanity check on the premise: a float64 cannot hold the canary.
	asFloat := uint64(float64(9007199254740993))
	if asFloat == 9007199254740993 {
		t.Fatal("float64 unexpectedly represents 2^53+1; the canary would prove nothing")
	}

	encoded, err := muxed.EncodeMuxed(validG, canary)
	if err != nil {
		t.Fatalf("EncodeMuxed: %v", err)
	}
	baseG, id, err := muxed.DecodeMuxed(encoded)
	if err != nil {
		t.Fatalf("DecodeMuxed: %v", err)
	}
	if baseG != validG {
		t.Errorf("base account = %q, want %q", baseG, validG)
	}
	if id != 9007199254740993 {
		t.Errorf("id = %d, want 9007199254740993", id)
	}

	neighbour, err := muxed.EncodeMuxed(validG, "9007199254740992")
	if err != nil {
		t.Fatalf("EncodeMuxed neighbour: %v", err)
	}
	if neighbour == encoded {
		t.Error("the canary and 2^53 encode to the same address; precision was lost")
	}
}

func TestSpecLargestUint64RoundTrips(t *testing.T) {
	encoded, err := muxed.EncodeMuxed(validG, maxUint64)
	if err != nil {
		t.Fatalf("EncodeMuxed: %v", err)
	}
	_, id, err := muxed.DecodeMuxed(encoded)
	if err != nil {
		t.Fatalf("DecodeMuxed: %v", err)
	}
	if id != ^uint64(0) {
		t.Errorf("id = %d, want %s", id, maxUint64)
	}
}

func TestSpecCanaryComesBackAsAnExactDecimalString(t *testing.T) {
	fromMemo := routing.ExtractRouting(routing.RoutingInput{
		Destination: validG,
		MemoType:    "id",
		MemoValue:   canary,
	})
	if fromMemo.RoutingID == nil || fromMemo.RoutingID.String() != canary {
		t.Errorf("memo routing id = %v, want %s", fromMemo.RoutingID, canary)
	}
	if fromMemo.RoutingSource != "memo" {
		t.Errorf("memo routing source = %q, want memo", fromMemo.RoutingSource)
	}

	address, err := muxed.EncodeMuxed(validG, canary)
	if err != nil {
		t.Fatalf("EncodeMuxed: %v", err)
	}
	fromMuxed := routing.ExtractRouting(routing.RoutingInput{
		Destination: address,
		MemoType:    "none",
	})
	if fromMuxed.RoutingID == nil || fromMuxed.RoutingID.String() != canary {
		t.Errorf("muxed routing id = %v, want %s", fromMuxed.RoutingID, canary)
	}
	if fromMuxed.RoutingSource != "muxed" {
		t.Errorf("muxed routing source = %q, want muxed", fromMuxed.RoutingSource)
	}
}

func TestSpecRoutingVectorsHoldTheCanonicalizationInvariants(t *testing.T) {
	_, cases := readVectors(t)
	checked := 0
	for i, c := range cases {
		if c.Module != "extract_routing" {
			continue
		}
		checked++
		c := c
		t.Run(vectorTestName(i, c.VectorCase), func(t *testing.T) {
			destination, err := normalizeVectorDestination(
				c.Input["destination"].(string),
				c.Expected["routingId"],
			)
			if err != nil {
				t.Fatalf("failed to normalize destination: %v", err)
			}
			result := routing.ExtractRouting(routing.RoutingInput{
				Destination:   destination,
				MemoType:      optionalString(c.Input["memoType"]),
				MemoValue:     optionalString(c.Input["memoValue"]),
				SourceAccount: optionalString(c.Input["sourceAccount"]),
			})

			if base := result.DestinationBaseAccount; base != strings.ToUpper(base) {
				t.Errorf("base account %q is not uppercase", base)
			}
			if result.RoutingID != nil {
				if id := result.RoutingID.String(); !canonicalRoutingID.MatchString(id) {
					t.Errorf("routing id %q is not a canonical decimal string", id)
				}
			}
		})
	}
	if checked == 0 {
		t.Fatal("no extract_routing vectors were checked")
	}
}

func TestSpecLeadingZerosAreStrippedWithAWarning(t *testing.T) {
	result := routing.ExtractRouting(routing.RoutingInput{
		Destination: validG,
		MemoType:    "id",
		MemoValue:   "0007",
	})
	if result.RoutingID == nil || result.RoutingID.String() != "7" {
		t.Fatalf("routing id = %v, want 7", result.RoutingID)
	}
	warned := false
	for _, w := range result.Warnings {
		if string(w.Code) == "NON_CANONICAL_ROUTING_ID" {
			warned = true
		}
	}
	if !warned {
		t.Errorf("warnings = %v, want NON_CANONICAL_ROUTING_ID", result.Warnings)
	}
}

func TestSpecLoneZeroKeepsItsDigitWithoutAWarning(t *testing.T) {
	result := routing.ExtractRouting(routing.RoutingInput{
		Destination: validG,
		MemoType:    "id",
		MemoValue:   "0",
	})
	if result.RoutingID == nil || result.RoutingID.String() != "0" {
		t.Fatalf("routing id = %v, want 0", result.RoutingID)
	}
	for _, w := range result.Warnings {
		if string(w.Code) == "NON_CANONICAL_ROUTING_ID" {
			t.Errorf("unexpected warning %v for a canonical zero", w)
		}
	}
}

func TestSpecLowercaseBaseAccountIsReturnedUppercase(t *testing.T) {
	result := routing.ExtractRouting(routing.RoutingInput{
		Destination: strings.ToLower(validG),
		MemoType:    "none",
	})
	if result.DestinationBaseAccount != validG {
		t.Errorf("base account = %q, want %q", result.DestinationBaseAccount, validG)
	}
}
