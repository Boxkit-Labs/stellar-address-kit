package routing

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/stellar-address-kit/core-go/address"
	"github.com/stellar-address-kit/core-go/muxed"
)

var digitsOnlyRegex = regexp.MustCompile(`^\d+$`)

func normalizeUnsupportedMemoType(memoType string) string {
	switch memoType {
	case "hash", "return":
		return memoType
	}

	switch strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(memoType, "_", ""), "-", "")) {
	case "memohash":
		return "hash"
	case "memoreturn":
		return "return"
	default:
		return ""
	}
}

func ExtractRouting(input RoutingInput) RoutingResult {
	if input.SourceAccount != "" {
		source, err := address.Parse(input.SourceAccount)
		if err == nil && source.Kind == address.KindC {
			return RoutingResult{
				RoutingSource: "none",
				Warnings: []address.Warning{{
					Code:     address.WarnContractSenderDetected,
					Severity: "info",
					Message:  "Contract source detected. Routing state cleared.",
				}},
			}
		}
	}

	parsed, err := address.Parse(input.Destination)
	if err != nil {
		addrErr, ok := err.(*address.AddressError)
		if !ok {
			addrErr = &address.AddressError{
				Code:    address.ErrUnknownPrefix,
				Input:   input.Destination,
				Message: err.Error(),
			}
		}

		return RoutingResult{
			RoutingSource: "none",
			Warnings:      []address.Warning{},
			DestinationError: &DestinationError{
				Code:    addrErr.Code,
				Message: addrErr.Message,
			},
		}
	}

	if parsed.Kind == address.KindC {
		return RoutingResult{
			RoutingSource: "none",
			Warnings: []address.Warning{{
				Code:     address.WarnInvalidDestination,
				Severity: "error",
				Message:  "C address is not a valid destination",
				Context: &address.WarningContext{
					DestinationKind: "C",
				},
			}},
		}
	}

	if parsed.Kind == address.KindM {
		baseG, idStr, err := muxed.DecodeMuxed(parsed.Raw)
		if err != nil {
			return RoutingResult{
				RoutingSource: "none",
				Warnings:      []address.Warning{},
				DestinationError: &DestinationError{
					Code:    address.ErrUnknownPrefix,
					Message: err.Error(),
				},
			}
		}

		warnings := []address.Warning{}
		memoValue := input.MemoValue

		if input.MemoType == "id" || (input.MemoType == "text" && digitsOnlyRegex.MatchString(memoValue)) {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoPresentWithMuxed,
				Severity: "warn",
				Message:  "Routing ID found in both M-address and Memo. M-address ID takes precedence.",
			})
		} else if input.MemoType != "none" {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoIgnoredForMuxed,
				Severity: "info",
				Message:  "Memo present with M-address. Any potential routing ID in memo is ignored.",
			})
		}

		idVal, _ := strconv.ParseUint(idStr, 10, 64)
		return RoutingResult{
			DestinationBaseAccount: baseG,
			RoutingID:              &idVal,
			RoutingSource:          "muxed",
			Warnings:               warnings,
		}
	}

	routingID := (*uint64)(nil)
	routingSource := "none"
	warnings := []address.Warning{}

	if input.MemoType == "id" {
		val, parseErr := strconv.ParseUint(input.MemoValue, 10, 64)
		if parseErr != nil {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoIDInvalidFormat,
				Severity: "warn",
				Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
			})
		} else {
			normalized := strconv.FormatUint(val, 10)
			if normalized != input.MemoValue {
				warnings = append(warnings, address.Warning{
					Code:     address.WarnNonCanonicalRoutingID,
					Severity: "warn",
					Message:  "Memo routing ID had leading zeros. Normalized to canonical decimal.",
					Normalization: &address.Normalization{
						Original:   input.MemoValue,
						Normalized: normalized,
					},
				})
			}
			routingID = &val
			routingSource = "memo"
		}
	} else if input.MemoType == "text" && input.MemoValue != "" {
		norm := NormalizeMemoTextID(input.MemoValue)
		if norm.Normalized != "" {
			parsedID, _ := strconv.ParseUint(norm.Normalized, 10, 64)
			routingID = &parsedID
			routingSource = "memo"
			warnings = append(warnings, norm.Warnings...)
		} else {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoTextUnroutable,
				Severity: "warn",
				Message:  "MEMO_TEXT was not a valid numeric uint64.",
			})
		}
	} else if unsupportedMemoType := normalizeUnsupportedMemoType(input.MemoType); unsupportedMemoType != "" {
		warnings = append(warnings, address.Warning{
			Code:     address.WarnUnsupportedMemoType,
			Severity: "warn",
			Message:  "Memo type " + unsupportedMemoType + " is not supported for routing.",
			Context: &address.WarningContext{
				MemoType: unsupportedMemoType,
			},
		})
	} else if input.MemoType != "none" {
		warnings = append(warnings, address.Warning{
			Code:     address.WarnUnsupportedMemoType,
			Severity: "warn",
			Message:  "Unrecognized memo type: " + input.MemoType,
			Context: &address.WarningContext{
				MemoType: "unknown",
			},
		})
	}

	return RoutingResult{
		DestinationBaseAccount: parsed.Raw,
		RoutingID:              routingID,
		RoutingSource:          routingSource,
		Warnings:               warnings,
	}
}
