package routing

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

const missingMemoMessage = "Destination account requires a memo, but no routing ID was provided."

// memoReqResponse builds a Horizon-style account payload from data entries
// that are already base64-encoded, mirroring Horizon's /accounts response.
func memoReqResponse(t *testing.T, data map[string]string) string {
	t.Helper()
	payload := map[string]any{"data": data}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("failed to marshal account payload: %v", err)
	}
	return string(body)
}

// newMemoReqServer starts a mock Horizon that answers every request with the
// given status and body, counting requests.
func newMemoReqServer(t *testing.T, status int, body string) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server, &hits
}

// fetchVia runs FetchMemoRequirementContext against the mock Horizon.
func fetchVia(t *testing.T, ctx context.Context, server *httptest.Server, accountID string) (bool, error) {
	t.Helper()
	return FetchMemoRequirementContext(ctx, accountID,
		WithHTTPClient(server.Client()),
		WithHorizonURL(server.URL),
	)
}

func TestFetchMemoRequirement_Base64MemoRequiredFlag(t *testing.T) {
	server, hits := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==", // base64("1")
	}))

	required, err := fetchVia(t, context.Background(), server, testBaseG)
	if err != nil {
		t.Fatalf("FetchMemoRequirementContext returned error: %v", err)
	}
	if !required {
		t.Errorf("required = false, want true for config.memo_required = MQ==")
	}
	if got := hits.Load(); got != 1 {
		t.Errorf("server hits = %d, want 1", got)
	}
}

func TestFetchMemoRequirement_LiteralValuesMatchTypeScript(t *testing.T) {
	tests := []struct {
		name  string
		value any
		want  bool
	}{
		{name: "string_one", value: "1", want: true},
		{name: "json_number_one", value: 1, want: true},
		{name: "json_true", value: true, want: true},
		{name: "json_false", value: false, want: false},
		{name: "json_number_zero", value: 0, want: false},
		{name: "base64_zero", value: "MA==", want: false},
		{name: "invalid_base64", value: "!!not-base64!!", want: false},
		{name: "base64_of_other_text", value: "aGVsbG8=", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, err := json.Marshal(map[string]any{
				"data": map[string]any{"config.memo_required": tt.value},
			})
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}
			server, _ := newMemoReqServer(t, http.StatusOK, string(body))

			required, err := fetchVia(t, context.Background(), server, testBaseG)
			if err != nil {
				t.Fatalf("FetchMemoRequirementContext returned error: %v", err)
			}
			if required != tt.want {
				t.Errorf("required = %v, want %v (value %#v)", required, tt.want, tt.value)
			}
		})
	}
}

func TestFetchMemoRequirement_RequiringMemoFallbackKey(t *testing.T) {
	tests := []struct {
		name string
		data map[string]any
		want bool
	}{
		{
			name: "requiring_memo_only",
			data: map[string]any{"config.requiring_memo": "MQ=="},
			want: true,
		},
		{
			name: "memo_required_false_requiring_memo_true",
			data: map[string]any{"config.memo_required": "MA==", "config.requiring_memo": "MQ=="},
			want: true,
		},
		{
			name: "both_false",
			data: map[string]any{"config.memo_required": "MA==", "config.requiring_memo": "MA=="},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, err := json.Marshal(map[string]any{"data": tt.data})
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}
			server, _ := newMemoReqServer(t, http.StatusOK, string(body))

			required, err := fetchVia(t, context.Background(), server, testBaseG)
			if err != nil {
				t.Fatalf("FetchMemoRequirementContext returned error: %v", err)
			}
			if required != tt.want {
				t.Errorf("required = %v, want %v", required, tt.want)
			}
		})
	}
}

func TestFetchMemoRequirement_FlagAbsentOrDataMissingReturnsFalse(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "empty_data_object", body: `{"data":{}}`},
		{name: "no_data_key", body: `{"id":"G..."}`},
		{name: "data_is_null", body: `{"data":null}`},
		{name: "data_is_not_an_object", body: `{"data":"nope"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, _ := newMemoReqServer(t, http.StatusOK, tt.body)

			required, err := fetchVia(t, context.Background(), server, testBaseG)
			if err != nil {
				t.Fatalf("FetchMemoRequirementContext returned error: %v", err)
			}
			if required {
				t.Errorf("required = true, want false")
			}
		})
	}
}

func TestFetchMemoRequirement_Non2xxReturnsFalseWithoutError(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
	}{
		{name: "unfunded_404", status: http.StatusNotFound, body: `{"title":"Not Found","status":404}`},
		{name: "server_error_500", status: http.StatusInternalServerError, body: "boom"},
		{name: "rate_limited_429", status: http.StatusTooManyRequests, body: "slow down"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, hits := newMemoReqServer(t, tt.status, tt.body)

			required, err := fetchVia(t, context.Background(), server, testBaseG)
			if err != nil {
				t.Fatalf("FetchMemoRequirementContext returned error: %v", err)
			}
			if required {
				t.Errorf("required = true, want false for status %d", tt.status)
			}
			if got := hits.Load(); got != 1 {
				t.Errorf("server hits = %d, want 1", got)
			}
		})
	}
}

func TestFetchMemoRequirement_MalformedResponsesReturnError(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "invalid_json", body: `{"data":`},
		{name: "json_null", body: `null`},
		{name: "empty_body", body: ``},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, _ := newMemoReqServer(t, http.StatusOK, tt.body)

			required, err := fetchVia(t, context.Background(), server, testBaseG)
			if err == nil {
				t.Fatalf("required = %v, want error for body %q", required, tt.body)
			}
			if required {
				t.Errorf("required = true, want false alongside error")
			}
		})
	}
}

func TestFetchMemoRequirement_NetworkFailureReturnsError(t *testing.T) {
	// Bind and immediately close a listener so the request is refused.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to reserve port: %v", err)
	}
	deadURL := "http://" + listener.Addr().String()
	_ = listener.Close()

	_, err = FetchMemoRequirementContext(context.Background(), testBaseG,
		WithHTTPClient(&http.Client{}),
		WithHorizonURL(deadURL),
	)
	if err == nil {
		t.Fatal("expected error for unreachable Horizon, got nil")
	}
}

func TestFetchMemoRequirement_ContextCancellation(t *testing.T) {
	server, _ := newMemoReqServer(t, http.StatusOK, `{"data":{}}`)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := fetchVia(t, ctx, server, testBaseG)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
}

func TestFetchMemoRequirement_ContextTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, err := fetchVia(t, ctx, server, testBaseG)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want context.DeadlineExceeded", err)
	}
}

func TestFetchMemoRequirement_RejectsInvalidAccountIDBeforeNetwork(t *testing.T) {
	tests := []struct {
		name      string
		accountID string
	}{
		{name: "empty", accountID: ""},
		{name: "not_an_address", accountID: "not-an-address"},
		{name: "muxed_address", accountID: testMuxed},
		{name: "truncated_g_address", accountID: testBaseG[:len(testBaseG)-1]},
		{name: "path_traversal_attempt", accountID: "../admin"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, hits := newMemoReqServer(t, http.StatusOK, `{"data":{}}`)

			required, err := fetchVia(t, context.Background(), server, tt.accountID)
			if !errors.Is(err, ErrInvalidAccountID) {
				t.Fatalf("error = %v, want ErrInvalidAccountID", err)
			}
			if required {
				t.Errorf("required = true, want false alongside error")
			}
			if got := hits.Load(); got != 0 {
				t.Errorf("server hits = %d, want 0 (validation must precede the network call)", got)
			}
		})
	}
}

func TestFetchMemoRequirement_UsesAccountPathUnderBaseURL(t *testing.T) {
	tests := []struct {
		name      string
		horizonFn func(serverURL string) string
		wantPath  func(accountID string) string
	}{
		{
			name:      "plain_base",
			horizonFn: func(serverURL string) string { return serverURL },
			wantPath:  func(id string) string { return "/accounts/" + id },
		},
		{
			name:      "trailing_slash_is_stripped",
			horizonFn: func(serverURL string) string { return serverURL + "/" },
			wantPath:  func(id string) string { return "/accounts/" + id },
		},
		{
			name:      "base_path_prefix_is_preserved",
			horizonFn: func(serverURL string) string { return serverURL + "/api" },
			wantPath:  func(id string) string { return "/api/accounts/" + id },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotPath string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.EscapedPath()
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"data":{}}`))
			}))
			t.Cleanup(server.Close)

			_, err := FetchMemoRequirementContext(context.Background(), testBaseG,
				WithHTTPClient(server.Client()),
				WithHorizonURL(tt.horizonFn(server.URL)),
			)
			if err != nil {
				t.Fatalf("FetchMemoRequirementContext returned error: %v", err)
			}
			if want := tt.wantPath(testBaseG); gotPath != want {
				t.Errorf("request path = %q, want %q", gotPath, want)
			}
		})
	}
}

func TestFetchMemoRequirement_BoundedResponseSize(t *testing.T) {
	huge := strings.Repeat("a", maxHorizonResponseBytes+64)
	server, _ := newMemoReqServer(t, http.StatusOK, huge)

	_, err := fetchVia(t, context.Background(), server, testBaseG)
	if err == nil {
		t.Fatal("expected error for oversized Horizon body, got nil")
	}
	if !strings.Contains(err.Error(), "exceeds") {
		t.Errorf("error = %v, want oversized-response error", err)
	}
}

func TestFetchMemoRequirement_ConvenienceWrapperRejectsInvalidID(t *testing.T) {
	// The no-context convenience form must keep the FetchMemoRequirement(id)
	// call shape; with an invalid ID it fails before touching the network.
	_, err := FetchMemoRequirement("definitely-not-an-account")
	if !errors.Is(err, ErrInvalidAccountID) {
		t.Fatalf("error = %v, want ErrInvalidAccountID", err)
	}
}

// startSlowMemoReqServer responds with a memo-required payload after delay.
func startSlowMemoReqServer(t *testing.T, delay time.Duration) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(delay)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{"config.memo_required":"MQ=="}}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func receiveResult(t *testing.T, ch <-chan RoutingResult) RoutingResult {
	t.Helper()
	select {
	case result, ok := <-ch:
		if !ok {
			t.Fatal("result channel closed without a value")
		}
		return result
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for ExtractRoutingAsync result")
		return RoutingResult{}
	}
}

func assertMissingMemoWarning(t *testing.T, result RoutingResult, want bool) {
	t.Helper()
	var found int
	for _, w := range result.Warnings {
		if w.Code == address.WarnMissingRequiredMemo {
			found++
			if w.Severity != "error" {
				t.Errorf("warning severity = %q, want %q", w.Severity, "error")
			}
			if w.Message != missingMemoMessage {
				t.Errorf("warning message = %q, want %q", w.Message, missingMemoMessage)
			}
		}
	}
	if found == 0 && want {
		t.Errorf("warnings = %+v, want MISSING_REQUIRED_MEMO appended", result.Warnings)
	}
	if found > 0 && !want {
		t.Errorf("warnings = %+v, want no MISSING_REQUIRED_MEMO warning", result.Warnings)
	}
	if found > 1 {
		t.Errorf("found %d MISSING_REQUIRED_MEMO warnings, want at most 1", found)
	}
}

func TestExtractRoutingAsync_MemoRequirementAppendsWarning(t *testing.T) {
	server, _ := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==",
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	result := receiveResult(t, ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination: testBaseG,
		MemoType:    "none",
	}, opts...))

	assertMissingMemoWarning(t, result, true)
	if result.DestinationBaseAccount != testBaseG {
		t.Errorf("DestinationBaseAccount = %q, want %q", result.DestinationBaseAccount, testBaseG)
	}
	if result.RoutingID != nil {
		t.Errorf("RoutingID = %v, want nil", result.RoutingID)
	}
	if len(result.Warnings) == 0 {
		t.Fatal("warnings = empty, want MISSING_REQUIRED_MEMO appended")
	}
	// The warning must be appended after all existing warnings.
	last := result.Warnings[len(result.Warnings)-1]
	if last.Code != address.WarnMissingRequiredMemo {
		t.Errorf("last warning = %q, want MISSING_REQUIRED_MEMO appended last", last.Code)
	}
}

func TestExtractRoutingAsync_MemoRequirementEmptyTextMemoKeepsExistingWarnings(t *testing.T) {
	server, _ := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==",
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	result := receiveResult(t, ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination: testBaseG,
		MemoType:    "text",
		MemoValue:   "",
	}, opts...))

	assertMissingMemoWarning(t, result, true)
	var codes []address.WarningCode
	for _, w := range result.Warnings {
		codes = append(codes, w.Code)
	}
	if len(codes) < 2 || codes[0] != address.WarnUnsupportedMemoType || codes[len(codes)-1] != address.WarnMissingRequiredMemo {
		t.Errorf("warning codes = %v, want existing warnings preserved with MISSING_REQUIRED_MEMO last", codes)
	}
}

func TestExtractRoutingAsync_MemoRequirementSkippedWhenRoutingIDPresent(t *testing.T) {
	server, hits := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==",
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	result := receiveResult(t, ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination: testBaseG,
		MemoType:    "id",
		MemoValue:   "100",
	}, opts...))

	assertMissingMemoWarning(t, result, false)
	if got := hits.Load(); got != 0 {
		t.Errorf("server hits = %d, want 0 when a routing ID is present", got)
	}
}

func TestExtractRoutingAsync_MemoRequirementSkippedForMuxedDestination(t *testing.T) {
	tests := []struct {
		name  string
		input RoutingInput
	}{
		{name: "muxed_no_memo", input: RoutingInput{Destination: testMuxed, MemoType: "none"}},
		{name: "muxed_with_unroutable_memo", input: RoutingInput{Destination: testMuxed, MemoType: "text", MemoValue: "not-a-routing-id"}},
		{name: "muxed_with_invalid_id_memo", input: RoutingInput{Destination: testMuxed, MemoType: "id", MemoValue: "abc"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, hits := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
				"config.memo_required": "MQ==",
			}))
			opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

			result := receiveResult(t, ExtractRoutingAsync(context.Background(), tt.input, opts...))

			assertMissingMemoWarning(t, result, false)
			if got := hits.Load(); got != 0 {
				t.Errorf("server hits = %d, want 0 for muxed destination", got)
			}
		})
	}
}

func TestExtractRoutingAsync_MemoRequirementSkippedForContractDestination(t *testing.T) {
	contractAddress, err := address.EncodeStrKey(address.VersionByteC, make([]byte, 32))
	if err != nil {
		t.Fatalf("failed to generate contract address: %v", err)
	}
	server, hits := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==",
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	result := receiveResult(t, ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination: contractAddress,
		MemoType:    "none",
	}, opts...))

	assertMissingMemoWarning(t, result, false)
	if got := hits.Load(); got != 0 {
		t.Errorf("server hits = %d, want 0 for contract destination", got)
	}
	if len(result.Warnings) != 1 || result.Warnings[0].Code != address.WarnInvalidDestination {
		t.Errorf("warnings = %+v, want INVALID_DESTINATION preserved", result.Warnings)
	}
}

func TestExtractRoutingAsync_MemoRequirementSkippedForContractSource(t *testing.T) {
	contractAddress, err := address.EncodeStrKey(address.VersionByteC, make([]byte, 32))
	if err != nil {
		t.Fatalf("failed to generate contract address: %v", err)
	}
	server, hits := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==",
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	result := receiveResult(t, ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination:   testBaseG,
		MemoType:      "none",
		SourceAccount: contractAddress,
	}, opts...))

	assertMissingMemoWarning(t, result, false)
	if got := hits.Load(); got != 0 {
		t.Errorf("server hits = %d, want 0 when routing state was cleared", got)
	}
}

func TestExtractRoutingAsync_MemoRequirementSkippedForInvalidDestination(t *testing.T) {
	server, hits := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MQ==",
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	result := receiveResult(t, ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination: "definitely-not-an-address",
		MemoType:    "none",
	}, opts...))

	assertMissingMemoWarning(t, result, false)
	if result.DestinationError == nil {
		t.Error("DestinationError = nil, want parse error preserved")
	}
	if got := hits.Load(); got != 0 {
		t.Errorf("server hits = %d, want 0 for invalid destination", got)
	}
}

func TestExtractRoutingAsync_MemoRequirementFalseLeavesResultUnchanged(t *testing.T) {
	server, _ := newMemoReqServer(t, http.StatusOK, memoReqResponse(t, map[string]string{
		"config.memo_required": "MA==", // base64("0")
	}))
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	input := RoutingInput{Destination: testBaseG, MemoType: "none"}
	result := receiveResult(t, ExtractRoutingAsync(context.Background(), input, opts...))

	assertMissingMemoWarning(t, result, false)
	if !reflectResultsEqual(result, ExtractRouting(input)) {
		t.Errorf("result = %+v, want unchanged sync result %+v", result, ExtractRouting(input))
	}
}

func TestExtractRoutingAsync_MemoRequirementFailOpenOnNetworkError(t *testing.T) {
	server, _ := newMemoReqServer(t, http.StatusOK, `{"data":{"config.memo_required":"MQ=="}}`)
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}
	server.Close() // connection refused from here on

	input := RoutingInput{Destination: testBaseG, MemoType: "none"}
	result := receiveResult(t, ExtractRoutingAsync(context.Background(), input, opts...))

	assertMissingMemoWarning(t, result, false)
	if !reflectResultsEqual(result, ExtractRouting(input)) {
		t.Errorf("result = %+v, want fail-open sync result %+v", result, ExtractRouting(input))
	}
}

func TestExtractRoutingAsync_MemoRequirementFailOpenOnContextCancellation(t *testing.T) {
	server := startSlowMemoReqServer(t, 300*time.Millisecond)
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	input := RoutingInput{Destination: testBaseG, MemoType: "none"}
	result := receiveResult(t, ExtractRoutingAsync(ctx, input, opts...))

	assertMissingMemoWarning(t, result, false)
	if !reflectResultsEqual(result, ExtractRouting(input)) {
		t.Errorf("result = %+v, want fail-open sync result %+v", result, ExtractRouting(input))
	}
}

func TestExtractRoutingAsync_MemoRequirementNonBlockingReturn(t *testing.T) {
	server := startSlowMemoReqServer(t, 400*time.Millisecond)
	opts := []FetchOption{WithHTTPClient(server.Client()), WithHorizonURL(server.URL)}

	start := time.Now()
	ch := ExtractRoutingAsync(context.Background(), RoutingInput{
		Destination: testBaseG,
		MemoType:    "none",
	}, opts...)
	elapsed := time.Since(start)

	if elapsed > 200*time.Millisecond {
		t.Fatalf("ExtractRoutingAsync call took %v, want prompt return while the lookup is in flight", elapsed)
	}

	result := receiveResult(t, ch)
	assertMissingMemoWarning(t, result, true)
}

// reflectResultsEqual compares two RoutingResults deeply (the name keeps
// call sites reading as an equality assertion).
func reflectResultsEqual(a, b RoutingResult) bool {
	return reflect.DeepEqual(a, b)
}
