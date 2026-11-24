package address

// WarningSeverity categorises how serious a Warning is. The three levels are
// shared by every Stellar Address Kit implementation (TypeScript, Go, Dart).
//
//   - SeverityInfo:  informational; the input was adjusted or carries no risk.
//   - SeverityWarn:  potential integration issue worth logging.
//   - SeverityError: the payment cannot be credited safely as-is.
type WarningSeverity string

const (
	SeverityInfo  WarningSeverity = "info"
	SeverityWarn  WarningSeverity = "warn"
	SeverityError WarningSeverity = "error"
)

// Rank orders severities: info (0) < warn (1) < error (2). An unrecognised
// value ranks as info so that it is never silently dropped by a filter.
func (s WarningSeverity) Rank() int {
	switch s {
	case SeverityWarn:
		return 1
	case SeverityError:
		return 2
	default:
		return 0
	}
}

// IsValid reports whether s is one of info, warn or error.
func (s WarningSeverity) IsValid() bool {
	switch s {
	case SeverityInfo, SeverityWarn, SeverityError:
		return true
	default:
		return false
	}
}

// DefaultSeverity returns the canonical severity for a warning code, and
// false for a code this version does not know.
func DefaultSeverity(code WarningCode) (WarningSeverity, bool) {
	switch code {
	case WarnSanitizedHiddenChars, WarnContractSenderDetected, WarnMemoIgnoredForMuxed:
		return SeverityInfo, true
	case WarnNonCanonicalAddress, WarnNonCanonicalRoutingID, WarnMemoPresentWithMuxed,
		WarnMemoTextUnroutable, WarnMemoIDInvalidFormat, WarnUnsupportedMemoType:
		return SeverityWarn, true
	case WarnInvalidDestination, WarnMissingRequiredMemo:
		return SeverityError, true
	default:
		return "", false
	}
}

// FilterWarnings returns the warnings whose severity is at least min, in their
// original order. An empty or unrecognised min keeps every warning (info), so a
// typo in a strict configuration never hides a warning. The input slice is not
// modified.
func FilterWarnings(warnings []Warning, min WarningSeverity) []Warning {
	threshold := min.Rank()
	if threshold == 0 {
		return warnings
	}
	out := make([]Warning, 0, len(warnings))
	for _, w := range warnings {
		if w.Severity.Rank() >= threshold {
			out = append(out, w)
		}
	}
	return out
}
