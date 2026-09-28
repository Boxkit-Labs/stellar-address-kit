package routing

import (
	"strconv"
	"strings"
	"unicode"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/muxed"
)

const sanitizedHiddenCharsMessage = "Destination was sanitized by removing hidden characters and surrounding whitespace."

// sanitizeDestination removes Unicode characters that are non-printable or
// intentionally invisible, then trims surrounding Unicode whitespace. Visible
// characters inside the address are retained so ordinary malformed input is
// still rejected by the StrKey parser.
func sanitizeDestination(destination string) (string, bool) {
	sanitized := strings.Map(func(r rune) rune {
		if !unicode.IsPrint(r) || isDefaultIgnorable(r) {
			return -1
		}
		return r
	}, destination)
	sanitized = strings.TrimSpace(sanitized)
	return sanitized, sanitized != destination
}

// unicode.IsPrint excludes control, format, private-use, surrogate, unassigned,
// line-separator, and paragraph-separator code points. This helper also removes
// printable characters with the Unicode Default_Ignorable_Code_Point property,
// including variation selectors and Hangul/Mongolian fillers.
func isDefaultIgnorable(r rune) bool {
	switch {
	case r == 0x034F,
		r >= 0x115F && r <= 0x1160,
		r >= 0x17B4 && r <= 0x17B5,
		r >= 0x180B && r <= 0x180F,
		r == 0x3164,
		r >= 0xFE00 && r <= 0xFE0F,
		r == 0xFFA0,
		r >= 0x1BCA0 && r <= 0x1BCA3,
		r >= 0x1D173 && r <= 0x1D17A,
		r >= 0xE0000 && r <= 0xE0FFF:
		return true
	default:
		return false
	}
}

// normalizeUnsupportedMemoType canonicalizes a memo type string by lower-casing it
// and stripping underscores and hyphens, then maps it to a known unsupported type.
// Uses strings.Builder to avoid intermediate string allocations from chained ReplaceAll/ToLower.
func normalizeUnsupportedMemoType(memoType string) string {
	switch memoType {
	case "hash", "return":
		return memoType
	}

	var sb strings.Builder
	sb.Grow(len(memoType))
	for i := 0; i < len(memoType); i++ {
		c := memoType[i]
		if c == '_' || c == '-' {
			continue
		}
		if 'A' <= c && c <= 'Z' {
			c += 'a' - 'A'
		}
		sb.WriteByte(c)
	}

	switch sb.String() {
	case "memohash":
		return "hash"
	case "memoreturn":
		return "return"
	default:
		return ""
	}
}

// ExtractRouting identifies the deposit routing destination and identifier from a Stellar
// payment input. It implements the standard priority policy where M-address identifiers
// take precedence over any provided memo. Returns a RoutingResult with the decoded
// state and applicable warnings.
func ExtractRouting(input RoutingInput) RoutingResult {
	destination, destinationSanitized := sanitizeDestination(input.Destination)
	sanitizationWarnings := make([]address.Warning, 0, 1)
	if destinationSanitized {
		sanitizationWarnings = append(sanitizationWarnings, address.Warning{
			Code:     address.WarnSanitizedHiddenChars,
			Severity: "info",
			Message:  sanitizedHiddenCharsMessage,
		})
	}

	if input.SourceAccount != "" {
		source, err := address.Parse(input.SourceAccount)
		if err == nil && source.Kind == address.KindC {
			warnings := append([]address.Warning{}, sanitizationWarnings...)
			warnings = append(warnings, address.Warning{
				Code:     address.WarnContractSenderDetected,
				Severity: "info",
				Message:  "Contract source detected. Routing state cleared.",
			})
			return RoutingResult{
				RoutingSource: "none",
				Warnings:      warnings,
			}
		}
	}

	parsed, err := address.Parse(destination)
	if err != nil {
		return RoutingResult{
			RoutingSource: "none",
			Warnings:      append([]address.Warning{}, sanitizationWarnings...),
			DestinationError: &DestinationError{
				Code:    address.ErrUnknownPrefix,
				Message: err.Error(),
			},
		}
	}

	if parsed.Kind == address.KindC {
		warnings := append([]address.Warning{}, sanitizationWarnings...)
		warnings = append(warnings, address.Warning{
			Code:     address.WarnInvalidDestination,
			Severity: "error",
			Message:  "C address is not a valid destination",
			Context: &address.WarningContext{
				DestinationKind: "C",
			},
		})
		return RoutingResult{
			RoutingSource: "none",
			Warnings:      warnings,
		}
	}

	if parsed.Kind == address.KindM {
		baseG, id, err := muxed.DecodeMuxed(parsed.Raw)
		if err != nil {
			return RoutingResult{
				RoutingSource: "none",
				Warnings:      append([]address.Warning{}, sanitizationWarnings...),
				DestinationError: &DestinationError{
					Code:    address.ErrUnknownPrefix,
					Message: err.Error(),
				},
			}
		}

		// Pre-allocate with capacity for existing warnings plus at most one more.
		warnings := make([]address.Warning, 0, len(sanitizationWarnings)+len(parsed.Warnings)+1)
		warnings = append(warnings, sanitizationWarnings...)
		warnings = append(warnings, parsed.Warnings...)
		memoValue := stringValue(input.MemoValue)

		// isAllDigits replaces the regex match to avoid heap allocation.
		if input.MemoType == "id" || (input.MemoType == "text" && isAllDigits(memoValue)) {
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

		return RoutingResult{
			DestinationBaseAccount: baseG,
			RoutingID:              NewRoutingID(strconv.FormatUint(id, 10)),
			RoutingSource:          "muxed",
			Warnings:               warnings,
		}
	}

	var routingID *RoutingID
	routingSource := "none"
	// Pre-allocate with capacity for existing address warnings plus at most two memo warnings.
	warnings := make([]address.Warning, 0, len(sanitizationWarnings)+len(parsed.Warnings)+2)
	warnings = append(warnings, sanitizationWarnings...)
	warnings = append(warnings, parsed.Warnings...)
	memoValue := stringValue(input.MemoValue)

	if input.MemoType == "id" {
		norm := NormalizeMemoTextID(memoValue)
		if norm.Normalized != "" {
			routingID = NewRoutingID(norm.Normalized)
			routingSource = "memo"
		}
		warnings = append(warnings, norm.Warnings...)

		if norm.Normalized == "" {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoIDInvalidFormat,
				Severity: "warn",
				Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
			})
		}
	} else if input.MemoType == "text" && memoValue != "" {
		norm := NormalizeMemoTextID(memoValue)
		if norm.Normalized != "" {
			routingID = NewRoutingID(norm.Normalized)
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
		// Use pre-computed string literals for known memo types to avoid string concatenation.
		var msg string
		switch unsupportedMemoType {
		case "hash":
			msg = "Memo type hash is not supported for routing."
		case "return":
			msg = "Memo type return is not supported for routing."
		}
		warnings = append(warnings, address.Warning{
			Code:     address.WarnUnsupportedMemoType,
			Severity: "warn",
			Message:  msg,
			Context: &address.WarningContext{
				MemoType: unsupportedMemoType,
			},
		})
	} else if input.MemoType != "none" {
		// Use strings.Builder to avoid the two intermediate allocations from "prefix" + var concatenation.
		var sb strings.Builder
		sb.Grow(len("Unrecognized memo type: ") + len(input.MemoType))
		sb.WriteString("Unrecognized memo type: ")
		sb.WriteString(input.MemoType)
		warnings = append(warnings, address.Warning{
			Code:     address.WarnUnsupportedMemoType,
			Severity: "warn",
			Message:  sb.String(),
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

// MemoRequirementFetcher retrieves whether a destination account requires a
// routing memo. Implementations can use Horizon, an indexer, or a cached source.
type MemoRequirementFetcher func(baseAccount string) (bool, error)

// ExtractRoutingWithMemoRequirement performs normal routing extraction and
// optionally adds the SEP-0029 error when a classic destination requires a
// memo but no routing ID was supplied. Fetch failures fail open so callers
// retain the result of the synchronous parser.
func ExtractRoutingWithMemoRequirement(input RoutingInput, fetch MemoRequirementFetcher) RoutingResult {
	result := ExtractRouting(input)
	if fetch == nil || result.DestinationBaseAccount == "" || result.RoutingID != nil || result.DestinationError != nil {
		return result
	}
	required, err := fetch(result.DestinationBaseAccount)
	if err == nil && required {
		result.Warnings = append(result.Warnings, address.Warning{
			Code:     address.WarnMissingRequiredMemo,
			Severity: "error",
			Message:  "Destination account requires a memo, but no routing ID was provided.",
		})
	}
	return result
}

func stringValue(s string) string {
	return s
}
