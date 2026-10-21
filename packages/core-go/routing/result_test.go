package routing

import (
	"encoding/json"
	"strings"
	"testing"
)

const canaryRoutingID = "9007199254740993" // 2^53+1, not representable as a JS Number

func TestRoutingResultMarshalJSONEmitsRoutingIDAsString(t *testing.T) {
	t.Parallel()

	result := RoutingResult{
		DestinationBaseAccount: "GDESTINATIONBASEACCOUNT",
		RoutingID:              NewRoutingID(canaryRoutingID),
		RoutingSource:          "muxed",
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	if !strings.Contains(string(data), `"routingId":"`+canaryRoutingID+`"`) {
		t.Fatalf("routingId must be a JSON string, got %s", data)
	}
}

func TestRoutingResultMarshalJSONOmitsUnsetRoutingID(t *testing.T) {
	t.Parallel()

	data, err := json.Marshal(RoutingResult{RoutingSource: "none"})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	if strings.Contains(string(data), "routingId") {
		t.Fatalf("unset routingId should be omitted, got %s", data)
	}
}

// The TypeScript and Dart cores serialize the ID as a string too; a mismatch
// here means a web frontend would truncate the value on JSON.parse.
func TestRoutingResultMarshalJSONMatchesTSAndDart(t *testing.T) {
	t.Parallel()

	representations := map[string]string{
		// core-ts: JSON.stringify({ routingId: id.toString() })
		"typescript": `{"routingId":"9007199254740993"}`,
		// core-dart: jsonEncode({'routingId': id.toJson()})
		"dart": `{"routingId":"9007199254740993"}`,
	}

	data, err := json.Marshal(RoutingResult{RoutingID: NewRoutingID(canaryRoutingID)})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	for name, payload := range representations {
		var want map[string]any
		if err := json.Unmarshal([]byte(payload), &want); err != nil {
			t.Fatalf("%s: json.Unmarshal() error = %v", name, err)
		}

		if got["routingId"] != want["routingId"] {
			t.Fatalf("%s routingId = %v, want %v", name, got["routingId"], want["routingId"])
		}
	}
}

func TestRoutingResultRoutingIDUint64(t *testing.T) {
	t.Parallel()

	result := RoutingResult{RoutingID: NewRoutingID(canaryRoutingID)}

	got, err := result.RoutingIDUint64()
	if err != nil {
		t.Fatalf("RoutingIDUint64() error = %v", err)
	}

	if got != 9007199254740993 {
		t.Fatalf("RoutingIDUint64() = %d, want %d", got, uint64(9007199254740993))
	}

	if _, err := (RoutingResult{}).RoutingIDUint64(); err == nil {
		t.Fatal("RoutingIDUint64() error = nil, want non-nil for unset id")
	}
}

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
