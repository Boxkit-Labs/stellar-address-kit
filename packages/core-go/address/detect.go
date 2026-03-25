package address

func Detect(addr string) (AddressKind, error) {
	versionByte, _, err := DecodeStrKey(addr)
	if err != nil {
		return "", err
	}

func Detect(address string) string {
	if strkey.IsValidEd25519PublicKey(address) {
		return "G"
	}
	if strkey.IsValidMuxedAccountEd25519PublicKey(address) {
		return "M"
	}
	if _, err := strkey.Decode(strkey.VersionByteContract, address); err == nil {
		return "C"
	}
	return "invalid"
}

