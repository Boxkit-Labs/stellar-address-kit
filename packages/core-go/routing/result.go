package routing

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/stellar-address-kit/core-go/address"
)

type MemoType string

const (
	MemoTypeNone   MemoType = "none"
	MemoTypeID     MemoType = "id"
	MemoTypeText   MemoType = "text"
	MemoTypeHash   MemoType = "hash"
	MemoTypeReturn MemoType = "return"
)

type RoutingID struct {
	raw string
}

func (r *RoutingID) UnmarshalJSON(data []byte) error {
	if r == nil {
		return fmt.Errorf("routing id: UnmarshalJSON on nil receiver")
	}

	if string(data) == "null" {
		r.raw = ""
		return nil
	}

	var id string
	if len(data) > 0 && data[0] == '"' {
		if err := json.Unmarshal(data, &id); err != nil {
			return fmt.Errorf("routing id: invalid quoted value: %w", err)
		}
	} else {
		id = string(data)
	}

	parsed, err := strconv.ParseUint(id, 10, 64)
	if err != nil {
		return fmt.Errorf("routing id: invalid uint64 value %q: %w", id, err)
	}

	r.raw = strconv.FormatUint(parsed, 10)
	return nil
}

func (r *RoutingID) String() string {
	if r == nil {
		return ""
	}
	return r.raw
}

func (r *RoutingID) Uint64() (uint64, error) {
	if r == nil {
		return 0, strconv.ErrSyntax
	}
	return strconv.ParseUint(r.raw, 10, 64)
}

func NewRoutingID(s string) *RoutingID {
	return &RoutingID{raw: s}
}

type RoutingResult struct {
	DestinationBaseAccount string
	RoutingID              *RoutingID
	RoutingSource          string // "muxed" | "memo" | "none"
	Warnings               []address.Warning
	DestinationError       *DestinationError
}

type DestinationError struct {
	Code    address.ErrorCode
	Message string
}
