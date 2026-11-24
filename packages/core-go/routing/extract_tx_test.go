package routing

import (
	"encoding/hex"
	"testing"

	"github.com/stellar/go/keypair"
	"github.com/stellar/go/protocols/horizon"
	"github.com/stellar/go/txnbuild"
)

func TestExtractRoutingFromTx_TxnbuildPayment(t *testing.T) {
	kp, err := keypair.Random()
	if err != nil {
		t.Fatalf("failed to generate keypair: %v", err)
	}

	sourceAccount := txnbuild.NewSimpleAccount(kp.Address(), 1)

	paymentOp := &txnbuild.Payment{
		Destination: testMuxed,
		Amount:      "10.5",
		Asset:       txnbuild.NativeAsset{},
	}

	memoID := txnbuild.MemoID(42)
	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{paymentOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		Memo:          memoID,
	})
	if err != nil {
		t.Fatalf("failed to build transaction: %v", err)
	}

	// 1. Test *txnbuild.Transaction
	res, err := ExtractRoutingFromTx(tx)
	if err != nil {
		t.Fatalf("ExtractRoutingFromTx returned error: %v", err)
	}
	if res == nil {
		t.Fatalf("expected non-nil result")
	}

	if res.DestinationBaseAccount != testBaseG {
		t.Errorf("expected destination base account %s, got %s", testBaseG, res.DestinationBaseAccount)
	}
	// M-address ID takes precedence over memo
	if res.RoutingSource != "memo" && res.RoutingSource != "muxed" {
		t.Errorf("expected routing source to be memo or muxed, got %s", res.RoutingSource)
	}

	// 2. Test txnbuild.Transaction (value)
	resVal, err := ExtractRoutingFromTx(*tx)
	if err != nil {
		t.Fatalf("ExtractRoutingFromTx(value) returned error: %v", err)
	}
	if resVal == nil || resVal.DestinationBaseAccount != testBaseG {
		t.Errorf("expected valid result for value transaction")
	}
}

func TestExtractRoutingFromTx_PathPaymentsAndValueTypes(t *testing.T) {
	kp, _ := keypair.Random()
	sourceAccount := txnbuild.NewSimpleAccount(kp.Address(), 1)

	receiveOp := txnbuild.PathPaymentStrictReceive{
		Destination:   testBaseG,
		DestAmount:    "100",
		DestAsset:     txnbuild.NativeAsset{},
		SendAsset:     txnbuild.NativeAsset{},
		SendMax:       "150",
		SourceAccount: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
	}

	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{&receiveOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		Memo:          txnbuild.MemoText("hello"),
	})
	if err != nil {
		t.Fatalf("failed to build transaction: %v", err)
	}

	// Test value operation directly in extractPaymentLikeOp
	dest, src, ok := extractPaymentLikeOp(receiveOp)
	if !ok || dest != testBaseG || src != "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" {
		t.Errorf("failed to extract payment-like value op: dest=%s, src=%s, ok=%v", dest, src, ok)
	}

	res, err := ExtractRoutingFromTx(tx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res == nil {
		t.Fatalf("expected non-nil result")
	}
	if res.DestinationBaseAccount != testBaseG {
		t.Errorf("expected %s, got %s", testBaseG, res.DestinationBaseAccount)
	}
}

func TestExtractRoutingFromTx_NonPaymentOperation(t *testing.T) {
	kp, _ := keypair.Random()
	sourceAccount := txnbuild.NewSimpleAccount(kp.Address(), 1)

	// CreateAccount should be ignored / return nil
	createOp := &txnbuild.CreateAccount{
		Destination: testBaseG,
		Amount:      "10",
	}

	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{createOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
	})
	if err != nil {
		t.Fatalf("failed to build transaction: %v", err)
	}

	res, err := ExtractRoutingFromTx(tx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res != nil {
		t.Errorf("expected nil for non-payment operation, got %+v", res)
	}
}

func TestExtractRoutingFromTx_OperationIndex(t *testing.T) {
	kp, _ := keypair.Random()
	sourceAccount := txnbuild.NewSimpleAccount(kp.Address(), 1)

	createOp := &txnbuild.CreateAccount{
		Destination: testBaseG,
		Amount:      "10",
	}
	payOp := &txnbuild.Payment{
		Destination: testBaseG,
		Amount:      "20",
		Asset:       txnbuild.NativeAsset{},
	}

	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{createOp, payOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
	})
	if err != nil {
		t.Fatalf("failed to build transaction: %v", err)
	}

	// Index 0 is CreateAccount -> nil
	res0, err := ExtractRoutingFromTx(tx, 0)
	if err != nil || res0 != nil {
		t.Errorf("expected nil for op index 0, got %v", res0)
	}

	// Index 1 is Payment -> valid result
	res1, err := ExtractRoutingFromTx(tx, 1)
	if err != nil || res1 == nil {
		t.Fatalf("expected valid result for op index 1, got error: %v", err)
	}
	if res1.DestinationBaseAccount != testBaseG {
		t.Errorf("expected %s, got %s", testBaseG, res1.DestinationBaseAccount)
	}

	// Out of bounds / negative index -> nil, nil
	resNeg, err := ExtractRoutingFromTx(tx, -1)
	if err != nil || resNeg != nil {
		t.Errorf("expected nil for negative index")
	}
	resOOB, err := ExtractRoutingFromTx(tx, 99)
	if err != nil || resOOB != nil {
		t.Errorf("expected nil for out-of-bounds index")
	}
}

func TestExtractAllRoutingFromTx_BatchedOperations(t *testing.T) {
	kp, _ := keypair.Random()
	sourceAccount := txnbuild.NewSimpleAccount(kp.Address(), 1)

	createOp := &txnbuild.CreateAccount{
		Destination: testBaseG,
		Amount:      "10",
	}
	payOp1 := &txnbuild.Payment{
		Destination: testBaseG,
		Amount:      "20",
		Asset:       txnbuild.NativeAsset{},
	}
	payOp2 := &txnbuild.PathPaymentStrictSend{
		Destination: testMuxed,
		SendAmount:  "30",
		SendAsset:   txnbuild.NativeAsset{},
		DestMin:     "25",
		DestAsset:   txnbuild.NativeAsset{},
	}

	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{createOp, payOp1, payOp2},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		Memo:          txnbuild.MemoText("batch"),
	})
	if err != nil {
		t.Fatalf("failed to build transaction: %v", err)
	}

	results, err := ExtractAllRoutingFromTx(tx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 payment operations extracted, got %d", len(results))
	}

	if results[0].OperationIndex != 1 {
		t.Errorf("expected operationIndex 1 for first payment, got %d", results[0].OperationIndex)
	}
	if results[0].Result.DestinationBaseAccount != testBaseG {
		t.Errorf("expected destination %s, got %s", testBaseG, results[0].Result.DestinationBaseAccount)
	}

	if results[1].OperationIndex != 2 {
		t.Errorf("expected operationIndex 2 for second payment, got %d", results[1].OperationIndex)
	}
	if results[1].Result.DestinationBaseAccount != testBaseG {
		t.Errorf("expected destination %s, got %s", testBaseG, results[1].Result.DestinationBaseAccount)
	}
}

func TestExtractRoutingFromTx_Memos(t *testing.T) {
	kp, _ := keypair.Random()
	sourceAccount := txnbuild.NewSimpleAccount(kp.Address(), 1)
	paymentOp := &txnbuild.Payment{
		Destination: testBaseG,
		Amount:      "10",
		Asset:       txnbuild.NativeAsset{},
	}

	hashBytes := [32]byte{0x01, 0x02, 0x03, 0x04}
	expectedHex := hex.EncodeToString(hashBytes[:])

	// MemoHash
	txHash, _ := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{paymentOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		Memo:          txnbuild.MemoHash(hashBytes),
	})
	resHash, err := ExtractRoutingFromTx(txHash)
	if err != nil || resHash == nil {
		t.Fatalf("failed on MemoHash: %v", err)
	}

	// MemoReturn
	txReturn, _ := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{paymentOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		Memo:          txnbuild.MemoReturn(hashBytes),
	})
	resReturn, err := ExtractRoutingFromTx(txReturn)
	if err != nil || resReturn == nil {
		t.Fatalf("failed on MemoReturn: %v", err)
	}

	_ = expectedHex
}

func TestExtractRoutingFromTx_FeeBumpAndXDR(t *testing.T) {
	kp1, _ := keypair.Random()
	kp2, _ := keypair.Random()

	sourceAccount := txnbuild.NewSimpleAccount(kp1.Address(), 1)
	feeSource := txnbuild.NewSimpleAccount(kp2.Address(), 1)

	paymentOp := &txnbuild.Payment{
		Destination: testBaseG,
		Amount:      "10",
		Asset:       txnbuild.NativeAsset{},
	}

	innerTx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount: &sourceAccount,
		Operations:    []txnbuild.Operation{paymentOp},
		BaseFee:       txnbuild.MinBaseFee,
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		Memo:          txnbuild.MemoID(999),
	})
	if err != nil {
		t.Fatalf("failed to build inner transaction: %v", err)
	}

	feeBumpTx, err := txnbuild.NewFeeBumpTransaction(txnbuild.FeeBumpTransactionParams{
		Inner:      innerTx,
		FeeAccount: feeSource.GetAccountID(),
		BaseFee:    txnbuild.MinBaseFee * 2,
	})
	if err != nil {
		t.Fatalf("failed to build fee bump transaction: %v", err)
	}

	// 1. Direct *txnbuild.FeeBumpTransaction
	resFB, err := ExtractRoutingFromTx(feeBumpTx)
	if err != nil || resFB == nil {
		t.Fatalf("failed on FeeBumpTransaction: %v", err)
	}
	if resFB.DestinationBaseAccount != testBaseG {
		t.Errorf("expected %s, got %s", testBaseG, resFB.DestinationBaseAccount)
	}

	// 2. Base64 XDR of FeeBump
	fbXDR, err := feeBumpTx.Base64()
	if err != nil {
		t.Fatalf("failed to get XDR: %v", err)
	}
	resXDR, err := ExtractRoutingFromTx(fbXDR)
	if err != nil || resXDR == nil {
		t.Fatalf("failed on XDR string: %v", err)
	}
	if resXDR.DestinationBaseAccount != testBaseG {
		t.Errorf("expected %s, got %s", testBaseG, resXDR.DestinationBaseAccount)
	}

	// 3. *horizon.Transaction
	hTx := &horizon.Transaction{
		EnvelopeXdr: fbXDR,
	}
	resHorizon, err := ExtractRoutingFromTx(hTx)
	if err != nil || resHorizon == nil {
		t.Fatalf("failed on horizon.Transaction: %v", err)
	}
	if resHorizon.DestinationBaseAccount != testBaseG {
		t.Errorf("expected %s, got %s", testBaseG, resHorizon.DestinationBaseAccount)
	}
}

func TestExtractRoutingFromTx_MapPayload(t *testing.T) {
	mapTx := map[string]any{
		"source_account": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
		"memo_type":      "id",
		"memo":           "123",
		"operations": []any{
			map[string]any{
				"type":        "payment",
				"destination": testBaseG,
			},
		},
	}

	res, err := ExtractRoutingFromTx(mapTx)
	if err != nil || res == nil {
		t.Fatalf("failed on map transaction: %v", err)
	}
	if res.DestinationBaseAccount != testBaseG {
		t.Errorf("expected %s, got %s", testBaseG, res.DestinationBaseAccount)
	}
	if res.RoutingSource != "memo" {
		t.Errorf("expected routing source memo, got %s", res.RoutingSource)
	}
}
