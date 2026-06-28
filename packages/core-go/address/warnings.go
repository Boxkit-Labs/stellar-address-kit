package address

type WarningCode string

const (
	WarnNonCanonicalAddress   WarningCode = "NON_CANONICAL_ADDRESS"
	WarnNonCanonicalRoutingID WarningCode = "NON_CANONICAL_ROUTING_ID"
	WarnMemoIgnoredForMuxed   WarningCode = "MEMO_IGNORED_FOR_MUXED"
	WarnMemoPresentWithMuxed  WarningCode = "MEMO_PRESENT_WITH_MUXED"
	WarnContractSenderDetected WarningCode = "CONTRACT_SENDER_DETECTED"
	WarnMemoTextUnroutable     WarningCode = "MEMO_TEXT_UNROUTABLE"
	WarnMemoIDInvalidFormat    WarningCode = "MEMO_ID_INVALID_FORMAT"
	WarnUnsupportedMemoType    WarningCode = "UNSUPPORTED_MEMO_TYPE"
	WarnInvalidDestination     WarningCode = "INVALID_DESTINATION"
	WarnMissingRequiredMemo    WarningCode = "MISSING_REQUIRED_MEMO"
)

type Warning struct {
	Code          WarningCode       `json:"code"`
	Message       string            `json:"message"`
	Severity      string            `json:"severity"`
	Normalization *Normalization    `json:"normalization,omitempty"`
	Context       *WarningContext   `json:"context,omitempty"`
}

type Normalization struct {
	Original   string `json:"original"`
	Normalized string `json:"normalized"`
}

type WarningContext struct {
	DestinationKind string `json:"destinationKind,omitempty"`
	MemoType        string `json:"memoType,omitempty"`
}
