package address

import "fmt"

type ErrorCode string

const (
	ErrInvalidChecksum               ErrorCode = "INVALID_CHECKSUM"
	ErrInvalidLength                 ErrorCode = "INVALID_LENGTH"
	ErrInvalidBase32                 ErrorCode = "INVALID_BASE32"
	ErrRejectedSeedKey               ErrorCode = "REJECTED_SEED_KEY"
	ErrRejectedPreauth               ErrorCode = "REJECTED_PREAUTH"
	ErrRejectedHashX                 ErrorCode = "REJECTED_HASH_X"
	ErrFederationAddressNotSupported ErrorCode = "FEDERATION_ADDRESS_NOT_SUPPORTED"
	ErrUnknownPrefix                 ErrorCode = "UNKNOWN_PREFIX"
)

// Error variables
var (
	ErrInvalidChecksumError    = fmt.Errorf(string(ErrInvalidChecksum))
	ErrInvalidBase32Error      = fmt.Errorf(string(ErrInvalidBase32))
	ErrInvalidLengthError      = fmt.Errorf(string(ErrInvalidLength))
	ErrUnknownVersionByteError = fmt.Errorf("unknown version byte")
)

// AddressError represents an address-related error
type AddressError struct {
	Code    ErrorCode
	Input   string
	Message string
}

func (e *AddressError) Error() string {
	return e.Message
}

