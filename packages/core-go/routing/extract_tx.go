package routing

import (
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"github.com/stellar/go/protocols/horizon"
	"github.com/stellar/go/txnbuild"
)

// OperationRoutingResult pairs an extracted routing result with the index
// of the transaction operation from which it was derived.
type OperationRoutingResult struct {
	OperationIndex int           `json:"operationIndex"`
	Result         RoutingResult `json:"result"`
}

// ExtractRoutingFromTx extracts routing information from a Stellar transaction.
//
// By default, it inspects the first operation (index 0). If operationIndex is
// specified, it inspects that specific operation index.
//
// Returns (nil, nil) if:
//   - tx is nil,
//   - the operation list is empty,
//   - operationIndex is negative or out of bounds,
//   - the targeted operation is not payment-like (e.g. CreateAccount, ChangeTrust).
//
// Supported transaction types:
//   - *txnbuild.Transaction / txnbuild.Transaction
//   - *txnbuild.FeeBumpTransaction / txnbuild.FeeBumpTransaction (unwrapping inner transaction)
//   - *txnbuild.GenericTransaction / txnbuild.GenericTransaction
//   - *horizon.Transaction / horizon.Transaction (decodes EnvelopeXdr)
//   - string (raw Base64 Envelope XDR)
//   - map[string]any (decoded Horizon payload or mock transaction map)
func ExtractRoutingFromTx(tx any, operationIndex ...int) (*RoutingResult, error) {
	if tx == nil {
		return nil, nil
	}

	targetIdx := 0
	if len(operationIndex) > 0 {
		targetIdx = operationIndex[0]
	}

	switch v := tx.(type) {
	case *txnbuild.Transaction:
		if v == nil {
			return nil, nil
		}
		return extractFromTxnbuildTransaction(v, targetIdx)

	case txnbuild.Transaction:
		return extractFromTxnbuildTransaction(&v, targetIdx)

	case *txnbuild.FeeBumpTransaction:
		if v == nil {
			return nil, nil
		}
		inner := v.InnerTransaction()
		return extractFromTxnbuildTransaction(inner, targetIdx)

	case txnbuild.FeeBumpTransaction:
		inner := v.InnerTransaction()
		return extractFromTxnbuildTransaction(inner, targetIdx)

	case *txnbuild.GenericTransaction:
		if v == nil {
			return nil, nil
		}
		return extractFromGenericTransaction(v, targetIdx)

	case txnbuild.GenericTransaction:
		return extractFromGenericTransaction(&v, targetIdx)

	case *horizon.Transaction:
		if v == nil {
			return nil, nil
		}
		return extractFromHorizonTransaction(v, targetIdx)

	case horizon.Transaction:
		return extractFromHorizonTransaction(&v, targetIdx)

	case string:
		// Raw Base64 Envelope XDR
		gtx, err := txnbuild.TransactionFromXDR(v)
		if err != nil {
			return nil, fmt.Errorf("failed to decode transaction XDR: %w", err)
		}
		return extractFromGenericTransaction(gtx, targetIdx)

	case map[string]any:
		return extractFromMapTransaction(v, targetIdx)

	default:
		return nil, fmt.Errorf("unsupported transaction type: %T", tx)
	}
}

// ExtractAllRoutingFromTx extracts routing information from every payment-like
// operation in a transaction, tagged with its respective operation index.
func ExtractAllRoutingFromTx(tx any) ([]OperationRoutingResult, error) {
	if tx == nil {
		return []OperationRoutingResult{}, nil
	}

	switch v := tx.(type) {
	case *txnbuild.Transaction:
		if v == nil {
			return []OperationRoutingResult{}, nil
		}
		return extractAllFromTxnbuildTransaction(v)

	case txnbuild.Transaction:
		return extractAllFromTxnbuildTransaction(&v)

	case *txnbuild.FeeBumpTransaction:
		if v == nil {
			return []OperationRoutingResult{}, nil
		}
		inner := v.InnerTransaction()
		return extractAllFromTxnbuildTransaction(inner)

	case txnbuild.FeeBumpTransaction:
		inner := v.InnerTransaction()
		return extractAllFromTxnbuildTransaction(inner)

	case *txnbuild.GenericTransaction:
		if v == nil {
			return []OperationRoutingResult{}, nil
		}
		return extractAllFromGenericTransaction(v)

	case txnbuild.GenericTransaction:
		return extractAllFromGenericTransaction(&v)

	case *horizon.Transaction:
		if v == nil {
			return []OperationRoutingResult{}, nil
		}
		return extractAllFromHorizonTransaction(v)

	case horizon.Transaction:
		return extractAllFromHorizonTransaction(&v)

	case string:
		gtx, err := txnbuild.TransactionFromXDR(v)
		if err != nil {
			return nil, fmt.Errorf("failed to decode transaction XDR: %w", err)
		}
		return extractAllFromGenericTransaction(gtx)

	case map[string]any:
		return extractAllFromMapTransaction(v)

	default:
		return nil, fmt.Errorf("unsupported transaction type: %T", tx)
	}
}

func extractFromGenericTransaction(gtx *txnbuild.GenericTransaction, targetIdx int) (*RoutingResult, error) {
	if feeBump, ok := gtx.FeeBump(); ok {
		inner := feeBump.InnerTransaction()
		return extractFromTxnbuildTransaction(inner, targetIdx)
	}
	if stdTx, ok := gtx.Transaction(); ok {
		return extractFromTxnbuildTransaction(stdTx, targetIdx)
	}
	return nil, fmt.Errorf("unknown generic transaction type")
}

func extractAllFromGenericTransaction(gtx *txnbuild.GenericTransaction) ([]OperationRoutingResult, error) {
	if feeBump, ok := gtx.FeeBump(); ok {
		inner := feeBump.InnerTransaction()
		return extractAllFromTxnbuildTransaction(inner)
	}
	if stdTx, ok := gtx.Transaction(); ok {
		return extractAllFromTxnbuildTransaction(stdTx)
	}
	return nil, fmt.Errorf("unknown generic transaction type")
}

func extractFromHorizonTransaction(h *horizon.Transaction, targetIdx int) (*RoutingResult, error) {
	if h.EnvelopeXdr != "" {
		gtx, err := txnbuild.TransactionFromXDR(h.EnvelopeXdr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode horizon transaction EnvelopeXdr: %w", err)
		}
		return extractFromGenericTransaction(gtx, targetIdx)
	}
	return nil, fmt.Errorf("horizon transaction missing EnvelopeXdr")
}

func extractAllFromHorizonTransaction(h *horizon.Transaction) ([]OperationRoutingResult, error) {
	if h.EnvelopeXdr != "" {
		gtx, err := txnbuild.TransactionFromXDR(h.EnvelopeXdr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode horizon transaction EnvelopeXdr: %w", err)
		}
		return extractAllFromGenericTransaction(gtx)
	}
	return []OperationRoutingResult{}, nil
}

func extractFromTxnbuildTransaction(tx *txnbuild.Transaction, targetIdx int) (*RoutingResult, error) {
	ops := tx.Operations()
	if targetIdx < 0 || targetIdx >= len(ops) {
		return nil, nil
	}

	dest, opSource, ok := extractPaymentLikeOp(ops[targetIdx])
	if !ok {
		return nil, nil
	}

	txSource := tx.SourceAccount().AccountID

	// op.source ?? tx.source precedence
	sourceAccount := opSource
	if sourceAccount == "" {
		sourceAccount = txSource
	}

	memoType, memoValue := extractMemo(tx.Memo())

	res := ExtractRouting(RoutingInput{
		Destination:   dest,
		MemoType:      memoType,
		MemoValue:     memoValue,
		SourceAccount: sourceAccount,
	})

	return &res, nil
}

func extractAllFromTxnbuildTransaction(tx *txnbuild.Transaction) ([]OperationRoutingResult, error) {
	ops := tx.Operations()
	txSource := tx.SourceAccount().AccountID

	memoType, memoValue := extractMemo(tx.Memo())
	results := make([]OperationRoutingResult, 0, len(ops))

	for i, op := range ops {
		dest, opSource, ok := extractPaymentLikeOp(op)
		if !ok {
			continue
		}

		sourceAccount := opSource
		if sourceAccount == "" {
			sourceAccount = txSource
		}

		res := ExtractRouting(RoutingInput{
			Destination:   dest,
			MemoType:      memoType,
			MemoValue:     memoValue,
			SourceAccount: sourceAccount,
		})

		results = append(results, OperationRoutingResult{
			OperationIndex: i,
			Result:         res,
		})
	}

	return results, nil
}

// extractPaymentLikeOp handles pointer and value types of Payment and PathPayment operations.
func extractPaymentLikeOp(op any) (destination string, opSource string, ok bool) {
	switch o := op.(type) {
	case *txnbuild.Payment:
		if o == nil {
			return "", "", false
		}
		return o.Destination, o.GetSourceAccount(), true
	case txnbuild.Payment:
		return o.Destination, o.GetSourceAccount(), true

	case *txnbuild.PathPaymentStrictReceive:
		if o == nil {
			return "", "", false
		}
		return o.Destination, o.GetSourceAccount(), true
	case txnbuild.PathPaymentStrictReceive:
		return o.Destination, o.GetSourceAccount(), true

	case *txnbuild.PathPaymentStrictSend:
		if o == nil {
			return "", "", false
		}
		return o.Destination, o.GetSourceAccount(), true
	case txnbuild.PathPaymentStrictSend:
		return o.Destination, o.GetSourceAccount(), true

	case map[string]any:
		return extractPaymentLikeMapOp(o)

	default:
		return "", "", false
	}
}

func extractPaymentLikeMapOp(m map[string]any) (destination string, opSource string, ok bool) {
	opType, _ := m["type"].(string)
	opTypeNorm := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(opType, "_", ""), "-", ""))

	switch opTypeNorm {
	case "payment", "pathpaymentstrictreceive", "pathpaymentstrictsend":
		dest, _ := m["destination"].(string)
		if dest == "" {
			dest, _ = m["to"].(string)
		}
		src, _ := m["source_account"].(string)
		if src == "" {
			src, _ = m["sourceAccount"].(string)
		}
		return dest, src, true
	default:
		return "", "", false
	}
}

func extractMemo(memo txnbuild.Memo) (memoType string, memoValue string) {
	if memo == nil {
		return "none", ""
	}

	switch m := memo.(type) {
	case txnbuild.MemoID:
		return "id", strconv.FormatUint(uint64(m), 10)
	case *txnbuild.MemoID:
		if m != nil {
			return "id", strconv.FormatUint(uint64(*m), 10)
		}
		return "none", ""

	case txnbuild.MemoText:
		return "text", string(m)
	case *txnbuild.MemoText:
		if m != nil {
			return "text", string(*m)
		}
		return "none", ""

	case txnbuild.MemoHash:
		return "hash", hex.EncodeToString(m[:])
	case *txnbuild.MemoHash:
		if m != nil {
			return "hash", hex.EncodeToString(m[:])
		}
		return "none", ""

	case txnbuild.MemoReturn:
		return "return", hex.EncodeToString(m[:])
	case *txnbuild.MemoReturn:
		if m != nil {
			return "return", hex.EncodeToString(m[:])
		}
		return "none", ""

	default:
		return "none", ""
	}
}

func extractFromMapTransaction(m map[string]any, targetIdx int) (*RoutingResult, error) {
	// If map contains envelope_xdr, decode via XDR
	if xdr, ok := m["envelope_xdr"].(string); ok && xdr != "" {
		gtx, err := txnbuild.TransactionFromXDR(xdr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode transaction map EnvelopeXdr: %w", err)
		}
		return extractFromGenericTransaction(gtx, targetIdx)
	}

	opsRaw, ok := m["operations"]
	if !ok {
		return nil, nil
	}

	var ops []any
	switch v := opsRaw.(type) {
	case []any:
		ops = v
	case []map[string]any:
		ops = make([]any, len(v))
		for i, item := range v {
			ops[i] = item
		}
	default:
		return nil, nil
	}

	if targetIdx < 0 || targetIdx >= len(ops) {
		return nil, nil
	}

	dest, opSource, ok := extractPaymentLikeOp(ops[targetIdx])
	if !ok {
		return nil, nil
	}

	txSource, _ := m["source_account"].(string)
	if txSource == "" {
		txSource, _ = m["sourceAccount"].(string)
	}

	sourceAccount := opSource
	if sourceAccount == "" {
		sourceAccount = txSource
	}

	memoType, _ := m["memo_type"].(string)
	if memoType == "" {
		memoType, _ = m["memoType"].(string)
	}
	if memoType == "" {
		memoType = "none"
	}

	memoValue, _ := m["memo"].(string)
	if memoValue == "" {
		memoValue, _ = m["memoValue"].(string)
	}

	res := ExtractRouting(RoutingInput{
		Destination:   dest,
		MemoType:      memoType,
		MemoValue:     memoValue,
		SourceAccount: sourceAccount,
	})

	return &res, nil
}

func extractAllFromMapTransaction(m map[string]any) ([]OperationRoutingResult, error) {
	if xdr, ok := m["envelope_xdr"].(string); ok && xdr != "" {
		gtx, err := txnbuild.TransactionFromXDR(xdr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode transaction map EnvelopeXdr: %w", err)
		}
		return extractAllFromGenericTransaction(gtx)
	}

	opsRaw, ok := m["operations"]
	if !ok {
		return []OperationRoutingResult{}, nil
	}

	var ops []any
	switch v := opsRaw.(type) {
	case []any:
		ops = v
	case []map[string]any:
		ops = make([]any, len(v))
		for i, item := range v {
			ops[i] = item
		}
	default:
		return []OperationRoutingResult{}, nil
	}

	txSource, _ := m["source_account"].(string)
	if txSource == "" {
		txSource, _ = m["sourceAccount"].(string)
	}

	memoType, _ := m["memo_type"].(string)
	if memoType == "" {
		memoType, _ = m["memoType"].(string)
	}
	if memoType == "" {
		memoType = "none"
	}

	memoValue, _ := m["memo"].(string)
	if memoValue == "" {
		memoValue, _ = m["memoValue"].(string)
	}

	results := make([]OperationRoutingResult, 0, len(ops))
	for i, op := range ops {
		dest, opSource, ok := extractPaymentLikeOp(op)
		if !ok {
			continue
		}

		sourceAccount := opSource
		if sourceAccount == "" {
			sourceAccount = txSource
		}

		res := ExtractRouting(RoutingInput{
			Destination:   dest,
			MemoType:      memoType,
			MemoValue:     memoValue,
			SourceAccount: sourceAccount,
		})

		results = append(results, OperationRoutingResult{
			OperationIndex: i,
			Result:         res,
		})
	}

	return results, nil
}
