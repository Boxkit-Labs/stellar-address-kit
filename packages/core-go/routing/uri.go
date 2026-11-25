package routing

import (
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"strings"
)

// URIErrorCode classifies SEP-0007 URI failures.
type URIErrorCode string

const (
	URIErrInvalidURI           URIErrorCode = "INVALID_URI"
	URIErrUnsupportedOperation URIErrorCode = "UNSUPPORTED_OPERATION"
	URIErrMissingDestination   URIErrorCode = "MISSING_DESTINATION"
	URIErrInvalidEncoding      URIErrorCode = "INVALID_ENCODING"
)

// URIError is a structured SEP-0007 parsing error.
type URIError struct {
	Code    URIErrorCode `json:"code"`
	Message string       `json:"message"`
}

// URIRoutingResult is the outcome of ExtractRoutingFromURI. Result is nil
// when Error is set.
type URIRoutingResult struct {
	Result      *RoutingResult `json:"result,omitempty"`
	Error       *URIError      `json:"error,omitempty"`
	Amount      string         `json:"amount,omitempty"`
	AssetCode   string         `json:"assetCode,omitempty"`
	AssetIssuer string         `json:"assetIssuer,omitempty"`
}

const uriScheme = "web+stellar:"

var sepMemoTypes = map[string]string{
	"MEMO_TEXT":   "text",
	"MEMO_ID":     "id",
	"MEMO_HASH":   "hash",
	"MEMO_RETURN": "return",
}

func uriFail(code URIErrorCode, msg string) URIRoutingResult {
	return URIRoutingResult{Error: &URIError{Code: code, Message: msg}}
}

func base64ToHex(v string) (string, bool) {
	s := strings.NewReplacer("-", "+", "_", "/").Replace(v)
	s = strings.TrimRight(s, "=")
	if len(s)%4 == 1 {
		return "", false
	}
	s += strings.Repeat("=", (4-len(s)%4)%4)
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(b) != 32 {
		return "", false
	}
	return hex.EncodeToString(b), true
}

// ExtractRoutingFromURI parses a SEP-0007 web+stellar:pay URI and delegates to
// ExtractRouting. It never panics; failures are reported in Error.
func ExtractRoutingFromURI(uri string) (out URIRoutingResult) {
	defer func() {
		if r := recover(); r != nil {
			out = uriFail(URIErrInvalidURI, "failed to process URI")
		}
	}()

	trimmed := strings.TrimSpace(uri)
	if trimmed == "" {
		return uriFail(URIErrInvalidURI, "URI must be a non-empty string")
	}
	if len(trimmed) < len(uriScheme) || !strings.EqualFold(trimmed[:len(uriScheme)], uriScheme) {
		return uriFail(URIErrInvalidURI, "URI must start with "+uriScheme)
	}

	rest := trimmed[len(uriScheme):]
	if i := strings.Index(rest, "#"); i >= 0 {
		rest = rest[:i]
	}
	operation, query := rest, ""
	if i := strings.Index(rest, "?"); i >= 0 {
		operation, query = rest[:i], rest[i+1:]
	}
	operation = strings.ToLower(operation)

	switch operation {
	case "pay":
	case "tx":
		return uriFail(URIErrUnsupportedOperation, "operation 'tx' is not supported")
	default:
		return uriFail(URIErrInvalidURI, "unknown SEP-0007 operation '"+operation+"'")
	}

	params := map[string]string{}
	for _, pair := range strings.Split(query, "&") {
		if pair == "" {
			continue
		}
		rawKey, rawVal := pair, ""
		if i := strings.Index(pair, "="); i >= 0 {
			rawKey, rawVal = pair[:i], pair[i+1:]
		}
		key, err1 := url.PathUnescape(rawKey)
		val, err2 := url.PathUnescape(rawVal)
		if err1 != nil || err2 != nil {
			return uriFail(URIErrInvalidEncoding, "query contains invalid percent-encoding")
		}
		if _, ok := params[key]; !ok {
			params[key] = val
		}
	}

	destination := strings.TrimSpace(params["destination"])
	if destination == "" {
		return uriFail(URIErrMissingDestination, "missing 'destination' parameter")
	}

	memoType, memoValue := "none", ""
	if memo := params["memo"]; memo != "" {
		sepType := "MEMO_TEXT"
		if t, ok := params["memo_type"]; ok {
			sepType = strings.ToUpper(t)
		}
		mapped, ok := sepMemoTypes[sepType]
		if !ok {
			return uriFail(URIErrInvalidURI, "unsupported memo_type '"+sepType+"'")
		}
		memoType, memoValue = mapped, memo
		if mapped == "hash" || mapped == "return" {
			h, ok := base64ToHex(memo)
			if !ok {
				return uriFail(URIErrInvalidEncoding, "memo for "+sepType+" must be base64-encoded 32 bytes")
			}
			memoValue = h
		}
	}

	// ExtractRouting reports destination problems through DestinationError and
	// warnings rather than panicking, so no extra guard is needed here.
	result := ExtractRouting(RoutingInput{
		Destination: destination,
		MemoType:    memoType,
		MemoValue:   memoValue,
	})
	return URIRoutingResult{
		Result:      &result,
		Amount:      params["amount"],
		AssetCode:   params["asset_code"],
		AssetIssuer: params["asset_issuer"],
	}
}
