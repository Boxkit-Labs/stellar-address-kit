package routing

type MemoType string

const (
	MemoTypeNone   MemoType = "none"
	MemoTypeID     MemoType = "id"
	MemoTypeText   MemoType = "text"
	MemoTypeHash   MemoType = "hash"
	MemoTypeReturn MemoType = "return"
)
