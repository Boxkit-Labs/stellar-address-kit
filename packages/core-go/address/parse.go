package address

import (
"encoding/binary"
"errors"
"strings"
)

// Parse parses a Stellar address string into an Address struct.
func Parse(input string) (*Address, error) {
kind, err := Detect(input)
if err != nil {
var code ErrorCode = ErrUnknownPrefix

switch {
case errors.Is(err, ErrInvalidChecksumError):
code = ErrInvalidChecksum
case errors.Is(err, ErrInvalidBase32Error):
code = ErrInvalidBase32
case errors.Is(err, ErrInvalidLengthError):
code = ErrInvalidLength
}

return nil, RoutingError{
Code:    code,
Input:   input,
Message: err.Error(),
}
}

raw := strings.ToUpper(input)
addr := &Address{
Kind: kind,
Raw:  raw,
}

if kind == KindM {
versionByte, payload, err := DecodeStrKey(raw)
if err != nil {
return nil, err
}
if versionByte != VersionByteM {
return nil, ErrUnknownPrefixError
}
if len(payload) != 40 {
return nil, ErrInvalidLengthError
}
pubkey := payload[:32]
id := binary.BigEndian.Uint64(payload[32:40])
baseG, err := EncodeStrKey(VersionByteG, pubkey)
if err != nil {
return nil, err
}
addr.BaseG = baseG
addr.MuxedID = id
}

return addr, nil
}
