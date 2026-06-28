package routing

import "github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"

// SeverityLevel represents a warning severity threshold.
type SeverityLevel string

const (
	SeverityInfo  SeverityLevel = "info"
	SeverityWarn  SeverityLevel = "warn"
	SeverityError SeverityLevel = "error"
)

var severityRank = map[SeverityLevel]int{
	SeverityInfo:  0,
	SeverityWarn:  1,
	SeverityError: 2,
}

// filterWarnings removes warnings below the given severity threshold.
func filterWarnings(warnings []address.Warning, min SeverityLevel) []address.Warning {
	if min == SeverityInfo {
		return warnings
	}
	minRank := severityRank[min]
	out := warnings[:0:0]
	for _, w := range warnings {
		if severityRank[SeverityLevel(w.Severity)] >= minRank {
			out = append(out, w)
		}
	}
	return out
}

// RoutingInput represents incoming routing payload data.
type RoutingInput struct {
	SourceAddress string            `json:"sourceAddress"`
	TargetChains  []string          `json:"targetChains"`
	Metadata      map[string]string `json:"metadata,omitempty"`

	// Backward-compatible fields used by current extraction flow.
	Destination      string        `json:"destination,omitempty"`
	MemoType         string        `json:"memoType,omitempty"`
	MemoValue        string        `json:"memoValue,omitempty"`
	SourceAccount    string        `json:"sourceAccount,omitempty"`
	MinSeverityLevel SeverityLevel `json:"minSeverityLevel,omitempty"`
}

// RoutingResult represents routing output data.
type RoutingResult struct {
	ResolvedAddresses map[string]string `json:"resolvedAddresses,omitempty"`
	Success           bool              `json:"success"`
	ErrorMessage      string            `json:"errorMessage,omitempty"`

	// Backward-compatible fields used by current extraction flow.
	DestinationBaseAccount string            `json:"destinationBaseAccount,omitempty"`
	RoutingID              *RoutingID        `json:"routingId,omitempty"`
	RoutingSource          string            `json:"routingSource,omitempty"`
	Warnings               []address.Warning `json:"warnings,omitempty"`
	DestinationError       *DestinationError `json:"destinationError,omitempty"`
}

type DestinationError struct {
	Code    address.ErrorCode `json:"code"`
	Message string            `json:"message"`
}
