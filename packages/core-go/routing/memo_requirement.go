package routing

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

type MemoRequirement struct {
	RequiringMemo bool
}

type MemoRequirementFetcher func(baseAccount string) (*MemoRequirement, error)

func parseMemoRequirementValue(value string) bool {
	decodedBytes, err := base64.StdEncoding.DecodeString(value)
	decoded := strings.TrimSpace(value)
	if err == nil {
		decoded = strings.TrimSpace(string(decodedBytes))
	}

	switch decoded {
	case "true", "1":
		return true
	case "false", "0", "":
		return false
	}

	var payload struct {
		RequiringMemo bool `json:"requiring_memo"`
	}
	if err := json.Unmarshal([]byte(decoded), &payload); err == nil {
		return payload.RequiringMemo
	}
	return false
}

func FetchMemoRequirement(baseAccount string, horizonURL ...string) (*MemoRequirement, error) {
	baseURL := "https://horizon.stellar.org"
	if len(horizonURL) > 0 && horizonURL[0] != "" {
		baseURL = horizonURL[0]
	}

	url := strings.TrimRight(baseURL, "/") + "/accounts/" + baseAccount
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("unable to fetch SEP-0029 memo requirement: %d", resp.StatusCode)
	}

	var account struct {
		DataAttr map[string]string `json:"data_attr"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&account); err != nil {
		return nil, err
	}

	value := account.DataAttr["config.requiring_memo"]
	if value == "" {
		value = account.DataAttr["config.memo_required"]
	}
	return &MemoRequirement{RequiringMemo: parseMemoRequirementValue(value)}, nil
}

func ApplyMemoRequirement(result RoutingResult, requirement *MemoRequirement) RoutingResult {
	if requirement == nil || !requirement.RequiringMemo || result.RoutingID != nil {
		return result
	}

	result.Warnings = append(result.Warnings, address.Warning{
		Code:     address.WarnMissingRequiredMemo,
		Severity: "error",
		Message:  "Destination account requires a memo/routing ID under SEP-0029, but none was provided.",
	})
	return result
}

func ExtractRoutingWithMemoRequirement(input RoutingInput, fetcher MemoRequirementFetcher) (RoutingResult, error) {
	result := ExtractRouting(input)
	if result.DestinationBaseAccount == "" {
		return result, nil
	}
	if fetcher == nil {
		fetcher = func(baseAccount string) (*MemoRequirement, error) {
			return FetchMemoRequirement(baseAccount)
		}
	}
	requirement, err := fetcher(result.DestinationBaseAccount)
	if err != nil {
		return result, err
	}
	return ApplyMemoRequirement(result, requirement), nil
}
