package address

type ParseResult struct {
	Kind     string
	Address  string
	Warnings []Warning
	Err      *AddressError
}
