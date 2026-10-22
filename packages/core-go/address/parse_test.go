package address

import "strings"

import "testing"

func TestParseMuxedAddress(t *testing.T) {
	const baseG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"

	tests := []struct {
		name       string
		mAddress   string
		wantBaseG  string
		wantMuxed  uint64
		shouldFail bool
	}{
		{
			name:      "decode id=0 boundary case",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672",
			wantBaseG: baseG,
			wantMuxed: 0,
		},
		{
			name:      "decode id=1 small positive case",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAHOO2",
			wantBaseG: baseG,
			wantMuxed: 1,
		},
		{
			name:      "decode id=2^53 precision boundary",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAAFZG",
			wantBaseG: baseG,
			wantMuxed: 9007199254740992,
		},
		{
			name:      "decode id=2^53+1 interop canary",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG",
			wantBaseG: baseG,
			wantMuxed: 9007199254740993,
		},
		{
			name:      "decode id=2^64-1 max uint64",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQAD7777777777774OFW",
			wantBaseG: baseG,
			wantMuxed: 18446744073709551615,
		},
		{
			name:       "invalid M-address should return error",
			mAddress:   "MZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
			shouldFail: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			addr, err := Parse(tt.mAddress)

			if tt.shouldFail {
				if err == nil {
					t.Fatalf("expected error, got none")
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if addr.Kind != KindM {
				t.Fatalf("expected KindM, got %v", addr.Kind)
			}

			if addr.Raw != tt.mAddress {
				t.Errorf("Raw = %s, want %s", addr.Raw, tt.mAddress)
			}

			if addr.BaseG != tt.wantBaseG {
				t.Errorf("BaseG = %s, want %s", addr.BaseG, tt.wantBaseG)
			}

			if addr.MuxedID != tt.wantMuxed {
				t.Errorf("MuxedID = %d, want %d", addr.MuxedID, tt.wantMuxed)
			}
		})
	}
}

func TestParseMuxedAddressEdgeCases(t *testing.T) {
	const baseG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"

	tests := []struct {
		name       string
		mAddress   string
		wantBaseG  string
		wantMuxed  uint64
		shouldFail bool
	}{
		{
			name:      "decode id=0 boundary case",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672",
			wantBaseG: baseG,
			wantMuxed: 0,
		},
		{
			name:      "decode id=1 small positive case",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAHOO2",
			wantBaseG: baseG,
			wantMuxed: 1,
		},
		{
			name:      "decode id=2^64-1 max uint64",
			mAddress:  "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQAD7777777777774OFW",
			wantBaseG: baseG,
			wantMuxed: 18446744073709551615,
		},
		{
			name:       "reject id=2^64 overflow",
			mAddress:   "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQAEAAAAAAAAAAAB777",
			shouldFail: true,
		},
		{
			name:       "reject truncated M-address",
			mAddress:   "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQAC",
			shouldFail: true,
		},
		{
			name:       "reject M-address with invalid checksum",
			mAddress:   "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAHOO3",
			shouldFail: true,
		},
		{
			name:       "reject M-address with lowercase payload",
			mAddress:   "maycuyt553c5lhve2xpw5gmejt4bxgm7ahmjwlapzp53kjo7eiqacaaaaaaaaaaaad672",
			shouldFail: true,
		},
		{
			name:       "reject M-address with zero-width space",
			mAddress:   "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672\u200b",
			shouldFail: true,
		},
		{
			name:       "reject M-address with bidi override",
			mAddress:   "\u202eMAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672",
			shouldFail: true,
		},
		{
			name:       "reject M-address with hidden unicode",
			mAddress:   "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672\ufeff",
			shouldFail: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			addr, err := Parse(tt.mAddress)

			if tt.shouldFail {
				if err == nil {
					t.Fatalf("expected error, got none")
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if addr.Kind != KindM {
				t.Fatalf("expected KindM, got %v", addr.Kind)
			}

			if addr.BaseG != tt.wantBaseG {
				t.Errorf("BaseG = %s, want %s", addr.BaseG, tt.wantBaseG)
			}

			if addr.MuxedID != tt.wantMuxed {
				t.Errorf("MuxedID = %d, want %d", addr.MuxedID, tt.wantMuxed)
			}
		})
	}
}

func TestParseRejectsUnicodeInAddress(t *testing.T) {
	const baseG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"

	bad := []string{
		baseG + "\u200b",
		baseG + "\u202e",
		baseG + "\ufeff",
		"\u200b" + baseG,
		strings.Replace(baseG, "G", "\u200bG", 1),
	}

	for _, s := range bad {
		if _, err := Parse(s); err == nil {
			t.Errorf("expected error for %q, got none", s)
		}
	}
}

