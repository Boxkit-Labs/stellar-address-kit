package address

// AddressKind represents the high-level kind of a Stellar address.
// It intentionally matches the leading character of the strkey encoding.
type AddressKind string

const (
	KindG AddressKind = "G"
	KindM AddressKind = "M"
	KindC AddressKind = "C"
)

// Address is a parsed Stellar address.
//
//   - For all kinds, Kind and Raw are populated.
//   - For muxed addresses (KindM), BaseG is the underlying G-address and
//     MuxedID is the 64-bit ID carried by the muxed account.
type Address struct {
	Kind    AddressKind
	Raw     string
	BaseG   string
	MuxedID uint64
}

