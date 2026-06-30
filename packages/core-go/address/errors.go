package address

// ErrorCode represents specific error types for pattern matching
type ErrorCode string

const (
ErrInvalidChecksum          ErrorCode = "INVALID_CHECKSUM"
ErrInvalidLength            ErrorCode = "INVALID_LENGTH"
ErrInvalidBase32            ErrorCode = "INVALID_BASE32"
ErrUnknownPrefix            ErrorCode = "UNKNOWN_PREFIX"
ErrRejectedSeedKey          ErrorCode = "REJECTED_SEED_KEY"
ErrRejectedPreauth          ErrorCode = "REJECTED_PREAUTH"
ErrRejectedHashX            ErrorCode = "REJECTED_HASH_X"
ErrFederationAddressNotSupported ErrorCode = "FEDERATION_ADDRESS_NOT_SUPPORTED"
)

// RoutingError is the main custom error type
type RoutingError struct {
Code    ErrorCode
Input   string
Message string
}

func (e RoutingError) Error() string {
return e.Message
}

// Is allows errors.Is to match by Code
func (e RoutingError) Is(target error) bool {
if targetErr, ok := target.(RoutingError); ok {
return e.Code == targetErr.Code
}
return false
}

// Common error variables
var (
ErrInvalidChecksumError       = RoutingError{Code: ErrInvalidChecksum, Message: "invalid checksum"}
ErrInvalidBase32Error         = RoutingError{Code: ErrInvalidBase32, Message: "invalid base32 encoding"}
ErrInvalidLengthError         = RoutingError{Code: ErrInvalidLength, Message: "invalid address length"}
ErrUnknownPrefixError         = RoutingError{Code: ErrUnknownPrefix, Message: "unknown address prefix"}
ErrFederationAddressNotSupportedError = RoutingError{Code: ErrFederationAddressNotSupported, Message: "federation address not supported"}
)

// Legacy / additional error for version byte
var ErrUnknownVersionByteError = RoutingError{
Code:    ErrUnknownPrefix,
Message: "unknown version byte",
}
