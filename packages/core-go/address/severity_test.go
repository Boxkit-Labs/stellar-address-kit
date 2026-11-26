package address

import (
	"reflect"
	"testing"
)

// canonicalSeverity mirrors WARNING_SEVERITY in core-ts and
// WarningSeverity.forCode in core-dart (issue #357).
var canonicalSeverity = map[WarningCode]WarningSeverity{
	WarnSanitizedHiddenChars:   SeverityInfo,
	WarnContractSenderDetected: SeverityInfo,
	WarnMemoIgnoredForMuxed:    SeverityInfo,
	WarnNonCanonicalAddress:    SeverityWarn,
	WarnNonCanonicalRoutingID:  SeverityWarn,
	WarnMemoPresentWithMuxed:   SeverityWarn,
	WarnMemoTextUnroutable:     SeverityWarn,
	WarnMemoIDInvalidFormat:    SeverityWarn,
	WarnUnsupportedMemoType:    SeverityWarn,
	WarnInvalidDestination:     SeverityError,
	WarnMissingRequiredMemo:    SeverityError,
}

func TestDefaultSeverityCatalog(t *testing.T) {
	for code, want := range canonicalSeverity {
		got, ok := DefaultSeverity(code)
		if !ok || got != want {
			t.Errorf("DefaultSeverity(%s) = %q, %v; want %q", code, got, ok, want)
		}
	}
	if _, ok := DefaultSeverity("NOT_A_CODE"); ok {
		t.Error("DefaultSeverity accepted an unknown code")
	}
}

func TestSeverityRank(t *testing.T) {
	cases := map[WarningSeverity]int{SeverityInfo: 0, SeverityWarn: 1, SeverityError: 2, "": 0, "fatal": 0}
	for s, want := range cases {
		if got := s.Rank(); got != want {
			t.Errorf("%q.Rank() = %d, want %d", s, got, want)
		}
	}
	if WarningSeverity("fatal").IsValid() || !SeverityWarn.IsValid() {
		t.Error("IsValid mismatch")
	}
}

func TestFilterWarnings(t *testing.T) {
	ws := []Warning{
		{Code: "a", Severity: SeverityInfo},
		{Code: "b", Severity: SeverityError},
		{Code: "c", Severity: SeverityWarn},
	}
	codes := func(in []Warning) []WarningCode {
		out := []WarningCode{}
		for _, w := range in {
			out = append(out, w.Code)
		}
		return out
	}
	cases := []struct {
		min  WarningSeverity
		want []WarningCode
	}{
		{SeverityInfo, []WarningCode{"a", "b", "c"}},
		{SeverityWarn, []WarningCode{"b", "c"}},
		{SeverityError, []WarningCode{"b"}},
		{"", []WarningCode{"a", "b", "c"}},
		{"bogus", []WarningCode{"a", "b", "c"}},
	}
	for _, tc := range cases {
		if got := codes(FilterWarnings(ws, tc.min)); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("FilterWarnings(min=%q) = %v, want %v", tc.min, got, tc.want)
		}
	}
	if len(ws) != 3 || ws[0].Code != "a" {
		t.Error("FilterWarnings mutated its input")
	}
}

func TestParseLowercaseEmitsNonCanonicalAddress(t *testing.T) {
	const g = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"
	lower := "gaycuyt553c5lhve2xpw5gmejt4bxgm7ahmjwlapzp53kjo7eiqadrsi"
	addr, err := Parse(lower)
	if err != nil {
		t.Fatal(err)
	}
	want := []Warning{{
		Code:          WarnNonCanonicalAddress,
		Severity:      SeverityWarn,
		Message:       "Address normalized to uppercase",
		Normalization: &Normalization{Original: lower, Normalized: g},
	}}
	if !reflect.DeepEqual(addr.Warnings, want) {
		t.Errorf("warnings = %#v, want %#v", addr.Warnings, want)
	}
	canonical, err := Parse(g)
	if err != nil {
		t.Fatal(err)
	}
	if len(canonical.Warnings) != 0 {
		t.Errorf("canonical input produced warnings: %#v", canonical.Warnings)
	}
}

func TestUnmarshalRejectsInvalidSeverity(t *testing.T) {
	var w Warning
	err := w.UnmarshalJSON([]byte(`{"code":"MEMO_TEXT_UNROUTABLE","message":"m","severity":"fatal"}`))
	if err == nil {
		t.Fatal("expected error for invalid severity")
	}
}
