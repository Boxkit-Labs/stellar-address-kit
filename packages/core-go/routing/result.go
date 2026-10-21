package routing

import (
	"encoding/json"
	"fmt"
	"strconv"
)

type MemoType string

const (
	MemoTypeNone   MemoType = "none"
	MemoTypeID     MemoType = "id"
	MemoTypeText   MemoType = "text"
	MemoTypeHash   MemoType = "hash"
	MemoTypeReturn MemoType = "return"
)

// RoutingID is a wrapper around a numeric string representing a 64-bit unsigned integer.
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

// MarshalJSON always emits the ID as a JSON string. A bare integer above
// 2^53-1 is truncated by JavaScript's JSON.parse, which silently misattributes
// deposits on web frontends.
func (r RoutingID) MarshalJSON() ([]byte, error) {
	return json.Marshal(r.raw)
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
