package routing

import (
	"encoding/json"
	"testing"
)

func TestRoutingIDUnmarshalJSONPreservesUint64Number(t *testing.T) {
	t.Parallel()

	payload := []byte(`{"id":18446744073709551615}`)
	var body struct {
		ID RoutingID `json:"id"`
	}

	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if got := body.ID.String(); got != "18446744073709551615" {
		t.Fatalf("RoutingID.String() = %q, want %q", got, "18446744073709551615")
	}

	gotUint64, err := body.ID.Uint64()
	if err != nil {
		t.Fatalf("RoutingID.Uint64() error = %v", err)
	}

	if gotUint64 != ^uint64(0) {
		t.Fatalf("RoutingID.Uint64() = %d, want %d", gotUint64, ^uint64(0))
	}
}

func TestRoutingIDUnmarshalJSONAcceptsQuotedDecimalString(t *testing.T) {
	t.Parallel()

	payload := []byte(`{"id":"18446744073709551615"}`)
	var body struct {
		ID RoutingID `json:"id"`
	}

	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if got := body.ID.String(); got != "18446744073709551615" {
		t.Fatalf("RoutingID.String() = %q, want %q", got, "18446744073709551615")
	}
}

func TestRoutingIDUnmarshalJSONRejectsInvalidNumbers(t *testing.T) {
	t.Parallel()

	testCases := []string{
		`{"id":18446744073709551616}`,
		`{"id":-1}`,
		`{"id":1.5}`,
		`{"id":"not-a-number"}`,
	}

	for _, payload := range testCases {
		payload := payload
		t.Run(payload, func(t *testing.T) {
			t.Parallel()

			var body struct {
				ID RoutingID `json:"id"`
			}

			if err := json.Unmarshal([]byte(payload), &body); err == nil {
				t.Fatalf("json.Unmarshal(%s) error = nil, want non-nil", payload)
			}
		})
	}
}
