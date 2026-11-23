package routing

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

type mockDoer struct {
	status int
	body   string
	err    error
	path   string
}

func (m *mockDoer) Do(req *http.Request) (*http.Response, error) {
	m.path = req.URL.Path
	if m.err != nil {
		return nil, m.err
	}
	return &http.Response{
		StatusCode: m.status,
		Body:       io.NopCloser(strings.NewReader(m.body)),
		Header:     http.Header{},
	}, nil
}

func clientWith(m *mockDoer) *HorizonClient {
	return &HorizonClient{BaseURL: "https://horizon.test/", HTTPClient: m}
}

func TestFetchMemoRequirement(t *testing.T) {
	tests := []struct {
		name string
		m    *mockDoer
		want bool
		err  bool
	}{
		{"memo_required", &mockDoer{status: 200, body: `{"data":{"config.memo_required":"MQ=="}}`}, true, false},
		{"requiring_memo", &mockDoer{status: 200, body: `{"data":{"config.requiring_memo":"MQ=="}}`}, true, false},
		{"wrong_value", &mockDoer{status: 200, body: `{"data":{"config.memo_required":"MA=="}}`}, false, false},
		{"no_data", &mockDoer{status: 200, body: `{"data":{}}`}, false, false},
		{"not_found", &mockDoer{status: 404, body: `{}`}, false, false},
		{"server_error", &mockDoer{status: 500, body: `{}`}, false, true},
		{"bad_json", &mockDoer{status: 200, body: `nope`}, false, true},
		{"network_error", &mockDoer{err: io.ErrUnexpectedEOF}, false, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := clientWith(tc.m).FetchMemoRequirement(context.Background(), testBaseG)
			if (err != nil) != tc.err || got != tc.want {
				t.Fatalf("got (%v, %v), want (%v, err=%v)", got, err, tc.want, tc.err)
			}
		})
	}
	m := &mockDoer{status: 200, body: `{}`}
	_, _ = clientWith(m).FetchMemoRequirement(context.Background(), testBaseG)
	if m.path != "/accounts/"+testBaseG {
		t.Fatalf("unexpected path %q", m.path)
	}
	if _, err := clientWith(m).FetchMemoRequirement(context.Background(), ""); err == nil {
		t.Fatal("expected error for empty account")
	}
}

func hasMissingMemo(r RoutingResult) bool {
	for _, w := range r.Warnings {
		if w.Code == address.WarnMissingRequiredMemo {
			return true
		}
	}
	return false
}

func TestExtractRoutingAsync(t *testing.T) {
	required := clientWith(&mockDoer{status: 200, body: `{"data":{"config.memo_required":"MQ=="}}`})
	input := RoutingInput{Destination: testBaseG, MemoType: "none"}

	if r := <-ExtractRoutingAsync(context.Background(), input, required); !hasMissingMemo(r) {
		t.Fatal("expected MISSING_REQUIRED_MEMO")
	}

	withMemo := RoutingInput{Destination: testBaseG, MemoType: "id", MemoValue: "42"}
	if r := <-ExtractRoutingAsync(context.Background(), withMemo, required); hasMissingMemo(r) {
		t.Fatal("unexpected warning when memo supplied")
	}

	failing := clientWith(&mockDoer{err: io.ErrUnexpectedEOF})
	if r := <-ExtractRoutingAsync(context.Background(), input, failing); hasMissingMemo(r) {
		t.Fatal("fetch failure must fail open")
	}

	if r := <-ExtractRoutingAsync(context.Background(), input, nil); hasMissingMemo(r) {
		t.Fatal("nil client must skip lookup")
	}
}
