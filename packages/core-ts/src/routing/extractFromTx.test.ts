import { describe, expect, it } from "vitest";
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  ExtractFromTxError,
  extractAllRoutingFromTx,
  extractRoutingFromTx,
} from "./extractFromTx";

const G = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const M = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672";
const PASS = Networks.TESTNET;

function build(memo: Memo, ops: ReturnType<typeof Operation.payment>[]) {
  const source = new Account(Keypair.random().publicKey(), "1");
  const builder = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: PASS,
    memo,
  }).setTimeout(0);
  ops.forEach((op) => builder.addOperation(op));
  return builder.build();
}

const pay = (destination: string) =>
  Operation.payment({ destination, asset: Asset.native(), amount: "1" });

describe("extractRoutingFromTx", () => {
  it("routes a payment with MEMO_ID", () => {
    const r = extractRoutingFromTx(build(Memo.id("12345"), [pay(G)]));
    expect(r?.operationIndex).toBe(0);
    expect(r?.operationType).toBe("payment");
    expect(r?.routing.routingSource).toBe("memo");
    expect(String(r?.routing.routingId)).toBe("12345");
    expect(r?.routing.destinationBaseAccount).toBe(G);
  });

  it("routes a numeric MEMO_TEXT", () => {
    const r = extractRoutingFromTx(build(Memo.text("987"), [pay(G)]));
    expect(String(r?.routing.routingId)).toBe("987");
  });

  it("maps MEMO_HASH and MEMO_RETURN to hex and honours allowHashRouting", () => {
    const hash = "ab".repeat(32);
    for (const memo of [Memo.hash(hash), Memo.return(hash)]) {
      const tx = build(memo, [pay(G)]);
      expect(extractRoutingFromTx(tx)?.routing.routingSource).toBe("none");
      const r = extractRoutingFromTx(tx, { allowHashRouting: true });
      expect(r?.routing.routingSource).toBe("memo");
      expect(r?.routing.routingId).toBe(hash);
    }
  });

  it("uses the muxed id for an M destination", () => {
    const r = extractRoutingFromTx(build(Memo.none(), [pay(M)]));
    expect(r?.routing.routingSource).toBe("muxed");
    expect(r?.routing.destinationBaseAccount).toBe(G);
  });

  it("accepts XDR strings, Horizon records, and fee-bump transactions", () => {
    const tx = build(Memo.id("42"), [pay(G)]);
    const xdr = tx.toXDR();
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      Keypair.random(),
      "200",
      tx,
      PASS
    );
    for (const input of [xdr, { envelope_xdr: xdr }, feeBump, feeBump.toXDR()]) {
      const r = extractRoutingFromTx(input, { networkPassphrase: PASS });
      expect(String(r?.routing.routingId)).toBe("42");
    }
  });

  it("returns null when there is no payment operation", () => {
    const tx = build(Memo.none(), [
      Operation.manageData({ name: "k", value: "v" }) as never,
    ]);
    expect(extractRoutingFromTx(tx)).toBeNull();
    expect(extractAllRoutingFromTx(tx)).toEqual([]);
  });

  it("throws ExtractFromTxError for unsupported or invalid input", () => {
    expect(() => extractRoutingFromTx("not-xdr")).toThrow(ExtractFromTxError);
    expect(() => extractRoutingFromTx({} as never)).toThrow(ExtractFromTxError);
  });
});

describe("extractAllRoutingFromTx", () => {
  it("returns one result per payment-like op, skipping others", () => {
    const tx = build(Memo.id("7"), [
      pay(G),
      Operation.manageData({ name: "k", value: "v" }) as never,
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: "10",
        destination: M,
        destAsset: Asset.native(),
        destAmount: "1",
        path: [],
      }) as never,
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: "1",
        destination: G,
        destAsset: Asset.native(),
        destMin: "1",
        path: [],
      }) as never,
    ]);
    const all = extractAllRoutingFromTx(tx);
    expect(all.map((r) => [r.operationIndex, r.operationType])).toEqual([
      [0, "payment"],
      [2, "pathPaymentStrictReceive"],
      [3, "pathPaymentStrictSend"],
    ]);
    expect(all[1].routing.routingSource).toBe("muxed");
    expect(String(all[2].routing.routingId)).toBe("7");
  });

  it("uses an operation-level source account when present", () => {
    const op = Operation.payment({
      destination: G,
      asset: Asset.native(),
      amount: "1",
      source: Keypair.random().publicKey(),
    });
    const [r] = extractAllRoutingFromTx(build(Memo.id("1"), [op]));
    expect(r.routing.routingSource).toBe("memo");
  });
});
