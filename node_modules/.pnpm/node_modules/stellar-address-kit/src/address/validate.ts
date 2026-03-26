import { detect } from "./detect";
import type { AddressKind } from "./types";

export function validate(address: string, kind?: AddressKind): boolean {
  const detected = detect(address);
  if (detected === "invalid") return false;
  if (kind === undefined) return true;
  return detected === kind;
}
