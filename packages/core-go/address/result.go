package address

type ParseResult struct {
	Kind     string
	Address  string
	Warnings []Warning
	Err      *AddressError
}

type AddressError struct {
	Code    ErrorCode
	Input   string
	Message string
}
