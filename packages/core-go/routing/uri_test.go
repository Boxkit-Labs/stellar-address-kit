package routing

import "testing"

const (
	uriG = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"
	uriM = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACABAAAAAAAAAAEVIG"
	// base64 of 32 bytes of 0xab, with '+'/'/'-free alphabet.
	uriB64 = "q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s%3D"
)

func TestExtractRoutingFromURI_Success(t *testing.T) {
	r := ExtractRoutingFromURI("web+stellar:pay?destination=" + uriG + "&amount=10&memo=42&memo_type=MEMO_ID&asset_code=USDC&asset_issuer=" + uriG)
	if r.Error != nil || r.Result == nil {
		t.Fatalf("unexpected error: %+v", r.Error)
	}
	if r.Result.RoutingID.String() != "42" || r.Result.RoutingSource != "memo" {
		t.Fatalf("bad routing: %+v", r.Result)
	}
	if r.Amount != "10" || r.AssetCode != "USDC" || r.AssetIssuer != uriG {
		t.Fatalf("bad params: %+v", r)
	}
}

func TestExtractRoutingFromURI_DefaultTextAndMuxed(t *testing.T) {
	r := ExtractRoutingFromURI("WEB+STELLAR:pay?destination=" + uriG + "&memo=%34%32")
	if r.Result == nil || r.Result.RoutingID.String() != "42" {
		t.Fatalf("bad: %+v", r)
	}
	r = ExtractRoutingFromURI("web+stellar:pay?destination=" + uriM)
	if r.Result == nil || r.Result.RoutingSource != "muxed" {
		t.Fatalf("bad: %+v", r)
	}
}

func TestExtractRoutingFromURI_HashEncoding(t *testing.T) {
	if h, ok := base64ToHex("q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s="); !ok || len(h) != 64 {
		t.Fatalf("base64ToHex failed: %q %v", h, ok)
	}
	r := ExtractRoutingFromURI("web+stellar:pay?destination=" + uriG + "&memo_type=MEMO_HASH&memo=" + uriB64)
	if r.Error != nil || r.Result == nil {
		t.Fatalf("unexpected: %+v", r.Error)
	}
	r = ExtractRoutingFromURI("web+stellar:pay?destination=" + uriG + "&memo=zz&memo_type=MEMO_RETURN")
	if r.Error == nil || r.Error.Code != URIErrInvalidEncoding {
		t.Fatalf("expected INVALID_ENCODING: %+v", r)
	}
}

func TestExtractRoutingFromURI_Errors(t *testing.T) {
	cases := map[string]URIErrorCode{
		"":                                  URIErrInvalidURI,
		"https://example.com":               URIErrInvalidURI,
		"web+stellar:foo?x=1":               URIErrInvalidURI,
		"web+stellar:tx?xdr=AAAA":           URIErrUnsupportedOperation,
		"web+stellar:pay?amount=1":          URIErrMissingDestination,
		"web+stellar:pay?destination=%ZZ":   URIErrInvalidEncoding,
		"web+stellar:pay?destination=" + uriG + "&memo=1&memo_type=BAD": URIErrInvalidURI,
	}
	for in, want := range cases {
		r := ExtractRoutingFromURI(in)
		if r.Error == nil || r.Error.Code != want {
			t.Errorf("%q: got %+v, want %s", in, r.Error, want)
		}
	}
}
