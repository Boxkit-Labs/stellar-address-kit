package muxed

import "fmt"

// ErrorCode represents a muxed address error code
type ErrorCode string

const (
	ErrInvalidGAddress   ErrorCode = "INVALID_G_ADDRESS"
	ErrUnknownVersionByte ErrorCode = "UNKNOWN_VERSION_BYTE"
	ErrInvalidLength     ErrorCode = "INVALID_LENGTH"
)

// AddressError represents a muxed address-related error
type AddressError struct {
	Code    ErrorCode
	Input   string
	Message string
	Cause   error
}

func (e *AddressError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}
	return e.Message
}

func (e *AddressError) Unwrap() error {
	return e.Cause
}

// Predefined muxed address errors
var (
	ErrInvalidGAddressError    = &AddressError{Code: ErrInvalidGAddress, Message: "invalid G address"}
	ErrUnknownVersionByteError = &AddressError{Code: ErrUnknownVersionByte, Message: "unknown version byte"}
	ErrInvalidLengthError      = &AddressError{Code: ErrInvalidLength, Message: "invalid length"}
)

// NewInvalidGAddressError creates an AddressError with a cause for invalid G address
func NewInvalidGAddressError(cause error) *AddressError {
	return &AddressError{
		Code:    ErrInvalidGAddress,
		Message: "invalid G address",
		Cause:   cause,
	}
}
