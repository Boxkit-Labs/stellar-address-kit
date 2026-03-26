package address

// Validate checks whether the given address is valid and, optionally,
// whether it matches one of the provided allowed kinds.
//
//   - If the address is syntactically invalid, it returns false.
//   - If no kinds are provided, any valid address kind is accepted.
//   - If kinds are provided, the detected kind must match at least one.
func Validate(addr string, kinds ...AddressKind) bool {
	detected, err := Detect(addr)
	if err != nil {
		return false
	}

	if len(kinds) == 0 {
		return true
	}

	for _, k := range kinds {
		if k == detected {
			return true
		}
	}

	return false
}

