package address

import (
	"github.com/stellar/go/strkey"
)

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
