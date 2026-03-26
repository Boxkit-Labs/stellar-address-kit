import { detect } from "./detect";
import type { AddressKind } from "./types";

/**
  * This function first detects the address type using {@link detect}.
  * - If the address is invalid, it returns `false`.
  * - If no `kind` is provided, any valid address returns `true`.
  * - If `kind` is provided, the address must match that type.
  *
  * @param address - The address string to validate.
  * @param AddressKindind - Optional expected address type: `"G"`, `"M"`, or `"C"`.
  * @returns `true` if the address is valid (and matches `kind` if provided), otherwise `false`.
  *
  * @example
  * validate("GBRPYHIL2C...");        // true
  * validate("MA3D5F...", "M");       // true
  * validate("CA7Q...", "G");         // false
  * validate("invalid");              // false
 */
export function validate(address: string, kind?: AddressKind): boolean {
  const detected = detect(address);
  if (detected === "invalid") return false;
  if (kind === undefined) return true;
  return detected === kind;
}
