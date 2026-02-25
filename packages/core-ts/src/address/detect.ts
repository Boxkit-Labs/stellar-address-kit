import { StrKey } from "@stellar/stellar-sdk";

export function detect(address: string): "G" | "M" | "C" | "invalid" {
  const up = address.toUpperCase();
  if (StrKey.isValidEd25519PublicKey(up)) return "G";
  if (StrKey.isValidMed25519PublicKey(up)) return "M";
  if (StrKey.isValidContract(up)) return "C";
  return "invalid";
}