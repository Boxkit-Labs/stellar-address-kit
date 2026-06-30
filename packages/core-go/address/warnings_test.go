package address

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestWarningMarshalJSON_VariantShapes(t *testing.T) {
	tests := []struct {
		name    string
		warning Warning
		want    string
	}{
		{
			name: "normalization warning includes normalization only",
			warning: Warning{
				Code:     WarnNonCanonicalRoutingID,
				Severity: "warn",
				Message:  "Memo routing ID had leading zeros. Normalized to canonical decimal.",
				Normalization: &Normalization{
					Original:   "007",
					Normalized: "7",
				},
				Context: &WarningContext{},
			},
			want: `{"code":"NON_CANONICAL_ROUTING_ID","message":"Memo routing ID had leading zeros. Normalized to canonical decimal.","severity":"warn","normalization":{"original":"007","normalized":"7"}}`,
		},
		{
			name: "context warning omits empty context fields",
			warning: Warning{
				Code:     WarnUnsupportedMemoType,
				Severity: "warn",
				Message:  "Memo type hash is not supported for routing.",
				Context: &WarningContext{
					MemoType: "hash",
				},
			},
			want: `{"code":"UNSUPPORTED_MEMO_TYPE","message":"Memo type hash is not supported for routing.","severity":"warn","context":{"memoType":"hash"}}`,
		},
		{
			name: "generic warning omits empty context entirely",
			warning: Warning{
				Code:     WarnMemoIDInvalidFormat,
				Severity: "warn",
				Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
				Context:  &WarningContext{},
			},
			want: `{"code":"MEMO_ID_INVALID_FORMAT","message":"MEMO_ID was empty, non-numeric, or exceeded uint64 max.","severity":"warn"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := json.Marshal(tt.warning)
			if err != nil {
				t.Fatalf("MarshalJSON returned error: %v", err)
			}
			if string(got) != tt.want {
				t.Fatalf("unexpected JSON\nwant: %s\ngot:  %s", tt.want, string(got))
			}
		})
	}
}

func TestWarningUnmarshalJSON_StrictVariants(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    Warning
	}{
		{
			name: "invalid destination warning",
			payload: `{"code":"INVALID_DESTINATION","severity":"error","message":"C address is not a valid destination","context":{"destinationKind":"C"}}`,
			want: Warning{
				Code:     WarnInvalidDestination,
				Severity: "error",
				Message:  "C address is not a valid destination",
				Context: &WarningContext{
					DestinationKind: "C",
				},
			},
		},
		{
			name: "generic warning with no optional fields",
			payload: `{"code":"MEMO_TEXT_UNROUTABLE","severity":"warn","message":"MEMO_TEXT was not a valid numeric uint64."}`,
			want: Warning{
				Code:     WarnMemoTextUnroutable,
				Severity: "warn",
				Message:  "MEMO_TEXT was not a valid numeric uint64.",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got Warning
			if err := json.Unmarshal([]byte(tt.payload), &got); err != nil {
				t.Fatalf("UnmarshalJSON returned error: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("unexpected warning\nwant: %#v\ngot:  %#v", tt.want, got)
			}
		})
	}
}

func TestWarningUnmarshalJSON_RejectsInvalidShapes(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{
			name:    "generic warning rejects context",
			payload: `{"code":"MEMO_ID_INVALID_FORMAT","severity":"warn","message":"bad memo","context":{"memoType":"hash"}}`,
		},
		{
			name:    "unsupported memo type requires memoType field",
			payload: `{"code":"UNSUPPORTED_MEMO_TYPE","severity":"warn","message":"unsupported","context":{"destinationKind":"C"}}`,
		},
		{
			name:    "invalid destination rejects extra nested fields",
			payload: `{"code":"INVALID_DESTINATION","severity":"error","message":"bad destination","context":{"destinationKind":"C","memoType":"hash"}}`,
		},
		{
			name:    "normalization warning requires normalization",
			payload: `{"code":"NON_CANONICAL_ADDRESS","severity":"warn","message":"normalized"}`,
		},
		{
			name:    "warning rejects unknown top level fields",
			payload: `{"code":"MEMO_TEXT_UNROUTABLE","severity":"warn","message":"bad memo","extra":true}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got Warning
			if err := json.Unmarshal([]byte(tt.payload), &got); err == nil {
				t.Fatalf("expected error, got none")
			}
		})
	}
}
