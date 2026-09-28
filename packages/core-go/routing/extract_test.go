package routing

import (
	"reflect"
	"testing"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

const (
	testBaseG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"
	testMuxed = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG"
)

func TestExtractRouting_RoutingMatrix(t *testing.T) {
	tests := []struct {
		name     string
		input    RoutingInput
		expected RoutingResult
	}{
		{
			name: "g_address_without_memo_routes_none",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "none",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings:               []address.Warning{},
			},
		},
		{
			name: "memo-id",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "100",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("100"),
				RoutingSource:          "memo",
				Warnings:               []address.Warning{},
			},
		},
		{
			name: "memo-id-zero",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "0",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("0"),
				RoutingSource:          "memo",
				Warnings:               []address.Warning{},
			},
		},
		{
			name: "memo-id-max-uint64",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "18446744073709551615",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("18446744073709551615"),
				RoutingSource:          "memo",
				Warnings:               []address.Warning{},
			},
		},
		{
			name: "memo-id-empty",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings: []address.Warning{
					{
						Code:     address.WarnMemoIDInvalidFormat,
						Severity: "warn",
						Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
					},
				},
			},
		},
		{
			name: "memo-id-non-numeric",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "abc",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings: []address.Warning{
					{
						Code:     address.WarnMemoIDInvalidFormat,
						Severity: "warn",
						Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
					},
				},
			},
		},
		{
			name: "memo-id-overflow",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "18446744073709551616",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings: []address.Warning{
					{
						Code:     address.WarnMemoIDInvalidFormat,
						Severity: "warn",
						Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
					},
				},
			},
		},
		{
			name: "memo-id-normalization",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "id",
				MemoValue:   "007",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("7"),
				RoutingSource:          "memo",
				Warnings: []address.Warning{
					{
						Code:     address.WarnNonCanonicalRoutingID,
						Severity: "warn",
						Message:  "Memo routing ID had leading zeros. Normalized to canonical decimal.",
						Normalization: &address.Normalization{
							Original:   "007",
							Normalized: "7",
						},
					},
				},
			},
		},
		{
			name: "memo-text",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "text",
				MemoValue:   "200",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("200"),
				RoutingSource:          "memo",
				Warnings:               []address.Warning{},
			},
		},
		{
			name: "memo-hash",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "hash",
				MemoValue:   "not-a-routing-id",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings: []address.Warning{
					{
						Code:     address.WarnUnsupportedMemoType,
						Severity: "warn",
						Message:  "Memo type hash is not supported for routing.",
						Context: &address.WarningContext{
							MemoType: "hash",
						},
					},
				},
			},
		},
		{
			name: "memo-return",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "return",
				MemoValue:   "also-not-a-routing-id",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings: []address.Warning{
					{
						Code:     address.WarnUnsupportedMemoType,
						Severity: "warn",
						Message:  "Memo type return is not supported for routing.",
						Context: &address.WarningContext{
							MemoType: "return",
						},
					},
				},
			},
		},
		{
			name: "g_address_with_unknown_memo_type_warns_unknown",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "memo_blob",
				MemoValue:   "opaque",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              nil,
				RoutingSource:          "none",
				Warnings: []address.Warning{
					{
						Code:     address.WarnUnsupportedMemoType,
						Severity: "warn",
						Message:  "Unrecognized memo type: memo_blob",
						Context: &address.WarningContext{
							MemoType: "unknown",
						},
					},
				},
			},
		},
		{
			name: "muxed",
			input: RoutingInput{
				Destination: testMuxed,
				MemoType:    "none",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("9007199254740993"),
				RoutingSource:          "muxed",
				Warnings:               []address.Warning{},
			},
		},
		{
			name: "m_address_with_routing_memo_warns_memo_present_with_muxed",
			input: RoutingInput{
				Destination: testMuxed,
				MemoType:    "id",
				MemoValue:   "42",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("9007199254740993"),
				RoutingSource:          "muxed",
				Warnings: []address.Warning{
					{
						Code:     address.WarnMemoPresentWithMuxed,
						Severity: "warn",
						Message:  "Routing ID found in both M-address and Memo. M-address ID takes precedence.",
					},
				},
			},
		},
		{
			name: "m_address_with_non_routing_memo_warns_memo_ignored",
			input: RoutingInput{
				Destination: testMuxed,
				MemoType:    "text",
				MemoValue:   "not-a-routing-id",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              NewRoutingID("9007199254740993"),
				RoutingSource:          "muxed",
				Warnings: []address.Warning{
					{
						Code:     address.WarnMemoIgnoredForMuxed,
						Severity: "info",
						Message:  "Memo present with M-address. Any potential routing ID in memo is ignored.",
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertRoutingResult(t, ExtractRouting(tt.input), tt.expected)
		})
	}
}

func TestExtractRouting_ContractSourceClearsRoutingState(t *testing.T) {
	t.Run("contract-source", func(t *testing.T) {
		contractAddress, err := address.EncodeStrKey(address.VersionByteC, make([]byte, 32))
		if err != nil {
			t.Fatalf("failed to generate contract address: %v", err)
		}

		result := ExtractRouting(RoutingInput{
			Destination:   testBaseG,
			MemoType:      "id",
			MemoValue:     "100",
			SourceAccount: contractAddress,
		})

		expected := RoutingResult{
			RoutingSource: "none",
			Warnings: []address.Warning{
				{
					Code:     address.WarnContractSenderDetected,
					Severity: "info",
					Message:  "Contract source detected. Routing state cleared.",
				},
			},
		}

		assertRoutingResult(t, result, expected)
	})
}

func assertRoutingResult(t *testing.T, got, want RoutingResult) {
	t.Helper()

	if got.DestinationBaseAccount != want.DestinationBaseAccount {
		t.Errorf("DestinationBaseAccount = %v, want %v", got.DestinationBaseAccount, want.DestinationBaseAccount)
	}
	if !routingIDEqual(got.RoutingID, want.RoutingID) {
		t.Errorf("RoutingID = %v, want %v", got.RoutingID.String(), want.RoutingID.String())
	}
	if got.RoutingSource != want.RoutingSource {
		t.Errorf("RoutingSource = %v, want %v", got.RoutingSource, want.RoutingSource)
	}
	if !reflect.DeepEqual(got.Warnings, want.Warnings) {
		t.Errorf("Warnings = %#+v, want %#+v", got.Warnings, want.Warnings)
	}
	if !reflect.DeepEqual(got.DestinationError, want.DestinationError) {
		t.Errorf("DestinationError = %#v, want %#v", got.DestinationError, want.DestinationError)
	}
}

func routingIDEqual(a, b *RoutingID) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return a.String() == b.String()
}

func TestExtractRouting_SanitizesHiddenDestinationCharacters(t *testing.T) {
	tests := []struct {
		name        string
		destination string
		wantBase    string
		wantID      *RoutingID
		wantSource  string
	}{
		{
			name:        "controls_and_surrounding_whitespace",
			destination: "\r\n \t" + testBaseG + " \t\r\n",
			wantBase:    testBaseG,
			wantSource:  "none",
		},
		{
			name: "zero_width_bidi_variation_selector_and_bom",
			destination: testBaseG[:8] + "\u200B" + testBaseG[8:20] + "\u202E" +
				testBaseG[20:32] + "\uFE0F" + testBaseG[32:] + "\uFEFF",
			wantBase:   testBaseG,
			wantSource: "none",
		},
		{
			name:        "supplementary_variation_selector",
			destination: testBaseG[:28] + "\U000E0100" + testBaseG[28:],
			wantBase:    testBaseG,
			wantSource:  "none",
		},
		{
			name: "muxed_with_isolate_nul_and_zero_width_joiner",
			destination: "\u2066" + testMuxed[:16] + "\x00" + testMuxed[16:48] +
				"\u200D" + testMuxed[48:] + "\u2069",
			wantBase:   testBaseG,
			wantID:     NewRoutingID("9007199254740993"),
			wantSource: "muxed",
		},
	}

	wantWarning := address.Warning{
		Code:     address.WarnSanitizedHiddenChars,
		Severity: "info",
		Message:  sanitizedHiddenCharsMessage,
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ExtractRouting(RoutingInput{
				Destination: tt.destination,
				MemoType:    "none",
			})

			if result.DestinationError != nil {
				t.Fatalf("unexpected destination error: %v", result.DestinationError)
			}
			if result.DestinationBaseAccount != tt.wantBase {
				t.Errorf("DestinationBaseAccount = %q, want %q", result.DestinationBaseAccount, tt.wantBase)
			}
			if !routingIDEqual(result.RoutingID, tt.wantID) {
				t.Errorf("RoutingID = %v, want %v", result.RoutingID, tt.wantID)
			}
			if result.RoutingSource != tt.wantSource {
				t.Errorf("RoutingSource = %q, want %q", result.RoutingSource, tt.wantSource)
			}
			if !reflect.DeepEqual(result.Warnings, []address.Warning{wantWarning}) {
				t.Errorf("Warnings = %#v, want %#v", result.Warnings, []address.Warning{wantWarning})
			}
		})
	}
}
