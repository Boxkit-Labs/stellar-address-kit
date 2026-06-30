package address

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type WarningCode string

const (
	WarnNonCanonicalAddress    WarningCode = "NON_CANONICAL_ADDRESS"
	WarnNonCanonicalRoutingID  WarningCode = "NON_CANONICAL_ROUTING_ID"
	WarnMemoIgnoredForMuxed    WarningCode = "MEMO_IGNORED_FOR_MUXED"
	WarnMemoPresentWithMuxed   WarningCode = "MEMO_PRESENT_WITH_MUXED"
	WarnContractSenderDetected WarningCode = "CONTRACT_SENDER_DETECTED"
	WarnMemoTextUnroutable     WarningCode = "MEMO_TEXT_UNROUTABLE"
	WarnMemoIDInvalidFormat    WarningCode = "MEMO_ID_INVALID_FORMAT"
	WarnUnsupportedMemoType    WarningCode = "UNSUPPORTED_MEMO_TYPE"
	WarnInvalidDestination     WarningCode = "INVALID_DESTINATION"
)

type Warning struct {
	Code          WarningCode     `json:"code"`
	Message       string          `json:"message"`
	Severity      string          `json:"severity"`
	Normalization *Normalization  `json:"normalization,omitempty"`
	Context       *WarningContext `json:"context,omitempty"`
}

type Normalization struct {
	Original   string `json:"original"`
	Normalized string `json:"normalized"`
}

type WarningContext struct {
	DestinationKind string `json:"destinationKind,omitempty"`
	MemoType        string `json:"memoType,omitempty"`
}

type warningJSON struct {
	Code          WarningCode      `json:"code"`
	Message       string           `json:"message"`
	Severity      string           `json:"severity"`
	Normalization *Normalization   `json:"normalization,omitempty"`
	Context       *warningContextJSON `json:"context,omitempty"`
}

type warningContextJSON struct {
	DestinationKind string `json:"destinationKind,omitempty"`
	MemoType        string `json:"memoType,omitempty"`
}

func (w Warning) MarshalJSON() ([]byte, error) {
	payload := warningJSON{
		Code:     w.Code,
		Message:  w.Message,
		Severity: w.Severity,
	}

	if w.usesNormalization() {
		if w.Normalization == nil {
			return nil, fmt.Errorf("warning %q requires normalization", w.Code)
		}
		if w.Normalization.Original == "" || w.Normalization.Normalized == "" {
			return nil, fmt.Errorf("warning %q: normalization requires original and normalized", w.Code)
		}
		payload.Normalization = w.Normalization
	}

	if w.usesContext() {
		ctx := w.normalizedContext()
		if ctx == nil {
			return nil, fmt.Errorf("warning %q requires context", w.Code)
		}
		if err := validateContextFields(w.Code, ctx); err != nil {
			return nil, err
		}
		payload.Context = &warningContextJSON{
			DestinationKind: ctx.DestinationKind,
			MemoType:        ctx.MemoType,
		}
	}

	if !w.usesNormalization() && w.Normalization != nil {
		return nil, fmt.Errorf("warning %q does not allow normalization", w.Code)
	}
	if !w.usesContext() && w.normalizedContext() != nil {
		return nil, fmt.Errorf("warning %q does not allow context", w.Code)
	}

	return json.Marshal(payload)
}

func (w *Warning) UnmarshalJSON(data []byte) error {
	if w == nil {
		return fmt.Errorf("warning: UnmarshalJSON on nil receiver")
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("warning: invalid JSON object: %w", err)
	}

	for key := range raw {
		switch key {
		case "code", "message", "severity", "normalization", "context":
		default:
			return fmt.Errorf("warning: unknown field %q", key)
		}
	}

	var payload warningJSON
	if err := json.Unmarshal(data, &payload); err != nil {
		return fmt.Errorf("warning: decode failed: %w", err)
	}

	result := Warning{
		Code:     payload.Code,
		Message:  payload.Message,
		Severity: payload.Severity,
	}

	if _, ok := raw["normalization"]; ok {
		if payload.Normalization == nil {
			return fmt.Errorf("warning %q: normalization must be an object", payload.Code)
		}
		result.Normalization = payload.Normalization
	}

	if _, ok := raw["context"]; ok {
		ctx := warningContextFromJSON(payload.Context)
		if ctx == nil {
			return fmt.Errorf("warning %q: context must be an object", payload.Code)
		}
		result.Context = ctx
	}

	if err := result.validate(raw); err != nil {
		return err
	}

	*w = result
	return nil
}

func (w Warning) validate(raw map[string]json.RawMessage) error {
	if len(bytes.TrimSpace(raw["code"])) == 0 {
		return fmt.Errorf("warning: missing required field \"code\"")
	}
	if len(bytes.TrimSpace(raw["message"])) == 0 {
		return fmt.Errorf("warning %q: missing required field \"message\"", w.Code)
	}
	if len(bytes.TrimSpace(raw["severity"])) == 0 {
		return fmt.Errorf("warning %q: missing required field \"severity\"", w.Code)
	}

	if w.usesNormalization() {
		if _, ok := raw["normalization"]; !ok || w.Normalization == nil {
			return fmt.Errorf("warning %q requires normalization", w.Code)
		}
		if err := validateNormalization(w.Code, raw["normalization"], w.Normalization); err != nil {
			return err
		}
		if w.normalizedContext() != nil || len(bytes.TrimSpace(raw["context"])) != 0 {
			return fmt.Errorf("warning %q does not allow context", w.Code)
		}
		return nil
	}

	if w.usesContext() {
		if _, ok := raw["context"]; !ok || w.normalizedContext() == nil {
			return fmt.Errorf("warning %q requires context", w.Code)
		}
		if err := validateContext(w.Code, raw["context"], w.Context); err != nil {
			return err
		}
		if w.Normalization != nil || len(bytes.TrimSpace(raw["normalization"])) != 0 {
			return fmt.Errorf("warning %q does not allow normalization", w.Code)
		}
		return nil
	}

	if w.Normalization != nil || len(bytes.TrimSpace(raw["normalization"])) != 0 {
		return fmt.Errorf("warning %q does not allow normalization", w.Code)
	}
	if w.normalizedContext() != nil || len(bytes.TrimSpace(raw["context"])) != 0 {
		return fmt.Errorf("warning %q does not allow context", w.Code)
	}

	return nil
}

func (w Warning) usesNormalization() bool {
	switch w.Code {
	case WarnNonCanonicalAddress, WarnNonCanonicalRoutingID:
		return true
	default:
		return false
	}
}

func (w Warning) usesContext() bool {
	switch w.Code {
	case WarnInvalidDestination, WarnUnsupportedMemoType:
		return true
	default:
		return false
	}
}

func (w Warning) normalizedContext() *WarningContext {
	if w.Context == nil {
		return nil
	}
	if w.Context.DestinationKind == "" && w.Context.MemoType == "" {
		return nil
	}
	return w.Context
}

func warningContextFromJSON(ctx *warningContextJSON) *WarningContext {
	if ctx == nil {
		return nil
	}
	result := &WarningContext{
		DestinationKind: ctx.DestinationKind,
		MemoType:        ctx.MemoType,
	}
	if result.DestinationKind == "" && result.MemoType == "" {
		return nil
	}
	return result
}

func validateNormalization(code WarningCode, raw json.RawMessage, n *Normalization) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return fmt.Errorf("warning %q: normalization must be an object", code)
	}
	for key := range fields {
		switch key {
		case "original", "normalized":
		default:
			return fmt.Errorf("warning %q: normalization has unknown field %q", code, key)
		}
	}
	if len(bytes.TrimSpace(fields["original"])) == 0 || len(bytes.TrimSpace(fields["normalized"])) == 0 {
		return fmt.Errorf("warning %q: normalization requires original and normalized", code)
	}
	if n.Original == "" || n.Normalized == "" {
		return fmt.Errorf("warning %q: normalization requires original and normalized", code)
	}
	return nil
}

func validateContext(code WarningCode, raw json.RawMessage, ctx *WarningContext) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return fmt.Errorf("warning %q: context must be an object", code)
	}
	for key := range fields {
		switch key {
		case "destinationKind", "memoType":
		default:
			return fmt.Errorf("warning %q: context has unknown field %q", code, key)
		}
	}

	switch code {
	case WarnInvalidDestination:
		if len(bytes.TrimSpace(fields["destinationKind"])) == 0 {
			return fmt.Errorf("warning %q: context requires destinationKind \"C\"", code)
		}
	case WarnUnsupportedMemoType:
		if len(bytes.TrimSpace(fields["memoType"])) == 0 {
			return fmt.Errorf("warning %q: context requires memoType", code)
		}
	}

	return validateContextFields(code, ctx)
}

func validateContextFields(code WarningCode, ctx *WarningContext) error {
	switch code {
	case WarnInvalidDestination:
		if ctx.DestinationKind != "C" {
			return fmt.Errorf("warning %q: context requires destinationKind \"C\"", code)
		}
		if ctx.MemoType != "" {
			return fmt.Errorf("warning %q: context does not allow memoType", code)
		}
	case WarnUnsupportedMemoType:
		switch ctx.MemoType {
		case "hash", "return", "unknown":
		default:
			return fmt.Errorf("warning %q: invalid context memoType %q", code, ctx.MemoType)
		}
		if ctx.DestinationKind != "" {
			return fmt.Errorf("warning %q: context does not allow destinationKind", code)
		}
	}

	return nil
}
