package routing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

const (
	// DefaultHorizonURL is the Horizon endpoint used when no override is
	// supplied via WithHorizonURL.
	DefaultHorizonURL = "https://horizon.stellar.org"

	// DefaultFetchTimeout bounds convenience calls made through
	// FetchMemoRequirement, which has no caller-supplied context.
	DefaultFetchTimeout = 10 * time.Second

	// maxHorizonResponseBytes bounds how much of a Horizon response body is
	// read while decoding a SEP-0029 account lookup.
	maxHorizonResponseBytes = 1 << 20 // 1 MiB
)

// ErrInvalidAccountID reports that a memo-requirement lookup was requested
// for a string that is not a valid classic Stellar account (G...) address.
var ErrInvalidAccountID = errors.New("invalid Stellar account ID")

// FetchOption customises the Horizon lookup performed by
// FetchMemoRequirementContext and ExtractRoutingAsync.
type FetchOption func(*fetchOptions)

type fetchOptions struct {
	client     *http.Client
	horizonURL string
}

// WithHTTPClient injects the HTTP client used for Horizon requests. A nil
// client is ignored and the default client is kept.
func WithHTTPClient(client *http.Client) FetchOption {
	return func(o *fetchOptions) {
		if client != nil {
			o.client = client
		}
	}
}

// WithHorizonURL overrides the Horizon base URL. An empty value is ignored
// and the default Horizon URL is kept.
func WithHorizonURL(horizonURL string) FetchOption {
	return func(o *fetchOptions) {
		if horizonURL != "" {
			o.horizonURL = horizonURL
		}
	}
}

// defaultFetchClient is used when no client is injected. Its timeout bounds
// lookups that otherwise have no context deadline.
var defaultFetchClient = &http.Client{Timeout: DefaultFetchTimeout}

// FetchMemoRequirement reports whether accountID requires a memo under
// SEP-0029, querying the default Horizon endpoint with a default-timeout
// client. It is the convenience form of FetchMemoRequirementContext; use the
// Context variant to control cancellation, the HTTP client, or the endpoint.
func FetchMemoRequirement(accountID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), DefaultFetchTimeout)
	defer cancel()
	return FetchMemoRequirementContext(ctx, accountID)
}

// FetchMemoRequirementContext looks up the SEP-0029 memo requirement for a
// classic Stellar account by requesting GET {horizon}/accounts/{accountID}
// and decoding the Horizon data entries `config.memo_required` and
// `config.requiring_memo` (Horizon stores them base64-encoded, e.g. "MQ=="
// for "1"). Both keys are accepted; either decoding to "1" means a memo is
// required.
//
// Behaviour mirrors the TypeScript fetchMemoRequirement:
//   - a non-2xx response (including 404 for unfunded accounts) reports
//     (false, nil) without parsing the body;
//   - transport failures, context cancellation, and malformed/JSON-null
//     bodies return a wrapped error (fail open at the ExtractRoutingAsync
//     layer);
//   - the account ID is validated as a G address before any network call,
//     returning ErrInvalidAccountID otherwise.
func FetchMemoRequirementContext(ctx context.Context, accountID string, opts ...FetchOption) (bool, error) {
	cfg := fetchOptions{client: defaultFetchClient, horizonURL: DefaultHorizonURL}
	for _, opt := range opts {
		opt(&cfg)
	}

	// Validate before building or issuing any request so untrusted input
	// can never reach the network layer.
	if !address.Validate(accountID, address.KindG) {
		return false, fmt.Errorf("%w: %q", ErrInvalidAccountID, accountID)
	}

	endpoint, err := horizonAccountURL(cfg.horizonURL, accountID)
	if err != nil {
		return false, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return false, fmt.Errorf("routing: build Horizon request: %w", err)
	}

	resp, err := cfg.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("routing: Horizon request failed: %w", err)
	}
	defer resp.Body.Close()

	// Any non-2xx response (404 unfunded, rate limits, server errors)
	// reports "no memo requirement", matching the TypeScript `!response.ok`
	// short-circuit.
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return false, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHorizonResponseBytes+1))
	if err != nil {
		return false, fmt.Errorf("routing: read Horizon response: %w", err)
	}
	if len(body) > maxHorizonResponseBytes {
		return false, fmt.Errorf("routing: Horizon response exceeds %d bytes", maxHorizonResponseBytes)
	}

	return decodeMemoRequirement(body)
}

// ExtractRoutingAsync performs ExtractRouting and, when the destination is a
// classic account that resolved no routing ID, additionally checks the
// destination's SEP-0029 memo requirement. It never blocks the calling
// goroutine: the (single) result is delivered on the returned channel, which
// is closed after the send.
//
// Semantics mirror the TypeScript extractRoutingAsync:
//   - no lookup happens when there is no base account, a routing ID is
//     already present (memo or muxed), or the destination failed to parse;
//   - a destination that requires a memo but supplied none gets a
//     MISSING_REQUIRED_MEMO error warning appended after all existing
//     warnings;
//   - fetch failures (network, timeout, context cancellation, malformed
//     responses) fail open and leave the synchronous result untouched.
//
// The Horizon lookup honours ctx; pass a context with a deadline when
// injecting a client that has no timeout of its own. Additional fetch
// settings are shared with FetchMemoRequirementContext via opts.
func ExtractRoutingAsync(ctx context.Context, input RoutingInput, opts ...FetchOption) <-chan RoutingResult {
	resultCh := make(chan RoutingResult, 1)

	go func() {
		defer close(resultCh)

		result := ExtractRouting(input)
		if result.DestinationBaseAccount == "" || result.RoutingID != nil || result.DestinationError != nil {
			resultCh <- result
			return
		}

		required, err := FetchMemoRequirementContext(ctx, result.DestinationBaseAccount, opts...)
		if err == nil && required {
			result.Warnings = append(result.Warnings, address.Warning{
				Code:     address.WarnMissingRequiredMemo,
				Severity: "error",
				Message:  "Destination account requires a memo, but no routing ID was provided.",
			})
		}
		resultCh <- result
	}()

	return resultCh
}

// horizonAccountURL builds {horizonURL}/accounts/{accountID} without string
// concatenation of the request URL. The account ID has already been
// validated as a strkey, and url.JoinPath keeps the segment escaping
// correct even for unusual base URLs.
func horizonAccountURL(horizonURL, accountID string) (*url.URL, error) {
	// The TypeScript reference strips a single trailing slash before
	// appending the path.
	base := strings.TrimSuffix(horizonURL, "/")
	u, err := url.Parse(base)
	if err != nil {
		return nil, fmt.Errorf("routing: invalid Horizon URL %q: %w", horizonURL, err)
	}
	if u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("routing: invalid Horizon URL %q: absolute URL required", horizonURL)
	}
	return u.JoinPath("accounts", url.PathEscape(accountID)), nil
}

// decodeMemoRequirement decodes a Horizon account response body.
func decodeMemoRequirement(body []byte) (bool, error) {
	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return false, fmt.Errorf("routing: decode Horizon account response: %w", err)
	}

	account, ok := payload.(map[string]any)
	if !ok {
		if payload == nil {
			// The TypeScript reference dereferences the parsed value, so a
			// JSON `null` body raises there; mirror that as an error.
			return false, errors.New("routing: Horizon account response was JSON null")
		}
		// Non-object JSON: property access yields undefined in TypeScript,
		// which decodes to false.
		return false, nil
	}

	data, _ := account["data"].(map[string]any)
	if data == nil {
		return false, nil
	}

	required := decodeMemoRequirementValue(data["config.memo_required"]) ||
		decodeMemoRequirementValue(data["config.requiring_memo"])
	return required, nil
}

// decodeMemoRequirementValue mirrors the TypeScript decodeDataValue helper:
// the literal values "1", 1, and true count as required, and any other
// string is base64-decoded (as Horizon stores data entries) and compared
// against "1".
func decodeMemoRequirementValue(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case float64:
		return v == 1
	case string:
		if v == "1" {
			return true
		}
		decoded, ok := decodeBase64Forgiving(v)
		return ok && decoded == "1"
	default:
		// null, objects, arrays, and any other type are not a requirement.
		return false
	}
}

// decodeBase64Forgiving decodes base64 the way JavaScript's atob (the
// WHATWG forgiving base64 algorithm) does: ASCII whitespace is ignored,
// padding is optional, and a leftover chunk of length %4 == 1 is invalid.
// It reports false when the input is not valid base64.
func decodeBase64Forgiving(s string) (string, bool) {
	var compact strings.Builder
	compact.Grow(len(s))
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case ' ', '\t', '\n', '\f', '\r':
			continue
		default:
			compact.WriteByte(s[i])
		}
	}

	trimmed := strings.TrimRight(compact.String(), "=")
	if len(trimmed)%4 == 1 {
		return "", false
	}
	padding := (4 - len(trimmed)%4) % 4
	decoded, err := base64.StdEncoding.DecodeString(trimmed + strings.Repeat("=", padding))
	if err != nil {
		return "", false
	}
	return string(decoded), true
}
