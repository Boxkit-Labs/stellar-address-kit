package routing

import (
	"reflect"
	"testing"

	"github.com/stellar-address-kit/core-go/address"
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
				RoutingID:              ptrUint64(100),
				RoutingSource:          "memo",
				Warnings:               []address.Warning{},
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
				RoutingID:              "200",
				RoutingSource:          "memo",
				Warnings:               []address.Warning{},
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
				RoutingID:              ptrUint64(7),
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
			name: "memo-hash",
			input: RoutingInput{
				Destination: testBaseG,
				MemoType:    "hash",
				MemoValue:   "not-a-routing-id",
			},
			expected: RoutingResult{
				DestinationBaseAccount: testBaseG,
				RoutingID:              "",
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
				MemoType:    "MEMO_RETURN",
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
				RoutingID:              ptrUint64(9007199254740993),
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
				RoutingID:              ptrUint64(9007199254740993),
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
				RoutingID:              ptrUint64(9007199254740993),
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

func ptrUint64(v uint64) *uint64 {
	return &v
}

func assertRoutingResult(t *testing.T, got, want RoutingResult) {
	t.Helper()

	if got.DestinationBaseAccount != want.DestinationBaseAccount {
		t.Errorf("DestinationBaseAccount = %v, want %v", got.DestinationBaseAccount, want.DestinationBaseAccount)
	}
	if !uint64PtrEqual(got.RoutingID, want.RoutingID) {
		t.Errorf("RoutingID = %v, want %v", got.RoutingID, want.RoutingID)
	}
	if got.RoutingSource != want.RoutingSource {
		t.Errorf("RoutingSource = %v, want %v", got.RoutingSource, want.RoutingSource)
	}
	if !reflect.DeepEqual(got.Warnings, want.Warnings) {
		t.Errorf("Warnings = %#v, want %#v", got.Warnings, want.Warnings)
	}
	if !reflect.DeepEqual(got.DestinationError, want.DestinationError) {
		t.Errorf("DestinationError = %#v, want %#v", got.DestinationError, want.DestinationError)
	}
}

func uint64PtrEqual(a, b *uint64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
