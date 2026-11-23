package routing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

)

// DefaultHorizonURL is the public Horizon endpoint used when none is configured.
const DefaultHorizonURL = "https://horizon.stellar.org"

// SEP-0029 account data entry keys. Either key set to "1" marks an account as
// requiring a memo on incoming payments.
var memoRequiredKeys = []string{"config.memo_required", "config.requiring_memo"}

// HTTPDoer is the subset of *http.Client used for Horizon lookups, which lets
// tests inject a mock client.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// HorizonClient queries Horizon for SEP-0029 memo requirements.
type HorizonClient struct {
	BaseURL    string
	HTTPClient HTTPDoer
}

// NewHorizonClient returns a client for the given Horizon URL. An empty URL
// selects DefaultHorizonURL.
func NewHorizonClient(baseURL string) *HorizonClient {
	if baseURL == "" {
		baseURL = DefaultHorizonURL
	}
	return &HorizonClient{
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// FetchMemoRequirement reports whether accountID has the SEP-0029 memo-required
// data entry set. A 404 (account does not exist) yields false with no error.
func (c *HorizonClient) FetchMemoRequirement(ctx context.Context, accountID string) (bool, error) {
	if accountID == "" {
		return false, fmt.Errorf("memo requirement: empty account id")
	}
	base := c.BaseURL
	if base == "" {
		base = DefaultHorizonURL
	}
	doer := c.HTTPClient
	if doer == nil {
		doer = http.DefaultClient
	}
	endpoint := strings.TrimRight(base, "/") + "/accounts/" + url.PathEscape(accountID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := doer.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("memo requirement: horizon returned status %d", resp.StatusCode)
	}

	var body struct {
		Data map[string]string `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, fmt.Errorf("memo requirement: invalid horizon response: %w", err)
	}
	for _, key := range memoRequiredKeys {
		if v, ok := body.Data[key]; ok {
			if decoded, err := base64.StdEncoding.DecodeString(v); err == nil && string(decoded) == "1" {
				return true, nil
			}
		}
	}
	return false, nil
}

// FetchMemoRequirement queries the default Horizon server for accountID.
func FetchMemoRequirement(accountID string) (bool, error) {
	return NewHorizonClient("").FetchMemoRequirement(context.Background(), accountID)
}


// ExtractRoutingAsync runs ExtractRoutingWithMemoRequirement in a goroutine and
// delivers the result on the returned channel (buffered, closed after send).
// It appends MISSING_REQUIRED_MEMO when the destination requires a memo but no
// routing ID was provided. Lookup failures or context cancellation fail open.
func ExtractRoutingAsync(ctx context.Context, input RoutingInput, client *HorizonClient) <-chan RoutingResult {
	out := make(chan RoutingResult, 1)
	go func() {
		defer close(out)
		if client == nil {
			out <- ExtractRouting(input)
			return
		}
		out <- ExtractRoutingWithMemoRequirement(input, func(account string) (bool, error) {
			return client.FetchMemoRequirement(ctx, account)
		})
	}()
	return out
}

