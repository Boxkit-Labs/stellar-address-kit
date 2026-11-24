package routing

import (
	"errors"
	"reflect"
	"testing"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

const sevG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"

func warningCodes(ws []address.Warning) []address.WarningCode {
	out := []address.WarningCode{}
	for _, w := range ws {
		out = append(out, w.Code)
	}
	return out
}

// noisyInput yields SANITIZED_HIDDEN_CHARS (info), NON_CANONICAL_ADDRESS (warn)
// and NON_CANONICAL_ROUTING_ID (warn); mirrors core-ts severity.test.ts.
func noisyInput(min address.WarningSeverity) RoutingInput {
	return RoutingInput{
		Destination:      " gaycuyt553c5lhve2xpw5gmejt4bxgm7ahmjwlapzp53kjo7eiqadrsi ",
		MemoType:         "id",
		MemoValue:        "0042",
		MinSeverityLevel: min,
	}
}

func TestMinSeverityLevelFiltering(t *testing.T) {
	cases := []struct {
		min  address.WarningSeverity
		want []address.WarningCode
	}{
		{"", []address.WarningCode{address.WarnSanitizedHiddenChars, address.WarnNonCanonicalAddress, address.WarnNonCanonicalRoutingID}},
		{address.SeverityInfo, []address.WarningCode{address.WarnSanitizedHiddenChars, address.WarnNonCanonicalAddress, address.WarnNonCanonicalRoutingID}},
		{address.SeverityWarn, []address.WarningCode{address.WarnNonCanonicalAddress, address.WarnNonCanonicalRoutingID}},
		{address.SeverityError, []address.WarningCode{}},
	}
	for _, tc := range cases {
		r := ExtractRouting(noisyInput(tc.min))
		if got := warningCodes(r.Warnings); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("min=%q warnings = %v, want %v", tc.min, got, tc.want)
		}
		if r.RoutingID == nil || r.RoutingID.String() != "42" || r.RoutingSource != "memo" || r.DestinationBaseAccount != sevG {
			t.Errorf("min=%q changed routing: %+v", tc.min, r)
		}
	}
}

func TestNonCanonicalAddressPayloadInRouting(t *testing.T) {
	r := ExtractRouting(RoutingInput{Destination: "gaycuyt553c5lhve2xpw5gmejt4bxgm7ahmjwlapzp53kjo7eiqadrsi", MemoType: "none"})
	if len(r.Warnings) != 1 {
		t.Fatalf("warnings = %#v", r.Warnings)
	}
	w := r.Warnings[0]
	if w.Code != address.WarnNonCanonicalAddress || w.Severity != address.SeverityWarn ||
		w.Normalization == nil || w.Normalization.Normalized != sevG ||
		w.Normalization.Original != "gaycuyt553c5lhve2xpw5gmejt4bxgm7ahmjwlapzp53kjo7eiqadrsi" {
		t.Errorf("unexpected warning %#v", w)
	}
}

func TestUnsupportedMemoTypeContext(t *testing.T) {
	cases := map[string]string{"hash": "hash", "return": "return", "MEMO_FOO": "unknown"}
	for memoType, ctx := range cases {
		r := ExtractRouting(RoutingInput{Destination: sevG, MemoType: memoType, MemoValue: "x"})
		if len(r.Warnings) != 1 {
			t.Fatalf("%s: warnings = %#v", memoType, r.Warnings)
		}
		w := r.Warnings[0]
		if w.Code != address.WarnUnsupportedMemoType || w.Severity != address.SeverityWarn || w.Context == nil || w.Context.MemoType != ctx {
			t.Errorf("%s: unexpected warning %#v", memoType, w)
		}
	}
}

func TestInvalidDestinationContextAndErrorThreshold(t *testing.T) {
	const c = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
	r := ExtractRouting(RoutingInput{Destination: c, MemoType: "none", MinSeverityLevel: address.SeverityError})
	if len(r.Warnings) != 1 {
		t.Fatalf("warnings = %#v", r.Warnings)
	}
	w := r.Warnings[0]
	if w.Code != address.WarnInvalidDestination || w.Severity != address.SeverityError || w.Context == nil || w.Context.DestinationKind != "C" {
		t.Errorf("unexpected warning %#v", w)
	}
}

func TestMemoRequirementRespectsMinSeverity(t *testing.T) {
	in := RoutingInput{Destination: " " + sevG, MemoType: "none", MinSeverityLevel: address.SeverityWarn}
	r := ExtractRoutingWithMemoRequirement(in, func(string) (bool, error) { return true, nil })
	if got := warningCodes(r.Warnings); !reflect.DeepEqual(got, []address.WarningCode{address.WarnMissingRequiredMemo}) {
		t.Errorf("warnings = %v", got)
	}
	r = ExtractRoutingWithMemoRequirement(in, func(string) (bool, error) { return false, errors.New("down") })
	if len(r.Warnings) != 0 {
		t.Errorf("info sanitization warning not filtered: %v", warningCodes(r.Warnings))
	}
}
