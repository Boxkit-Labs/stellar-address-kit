import { StrKey } from '@stellar/stellar-sdk';

/**
 * Valid address types supported by the kit.
 */
export type AddressKind = 'G' | 'M' | 'C';

/**
 * Identifies the Stellar address type and validates the checksum.
 * * @param address - The encoded Stellar address string.
 * @returns The AddressKind ('G', 'M', or 'C') if valid, otherwise null.
 */
export function detect(address: string): AddressKind | null {
  if (!address || typeof address !== 'string') {
    return null;
  }

  // Use StrKey primitives to validate both prefix and CRC16 checksum
  if (StrKey.isValidEd25519PublicKey(address)) {
    return 'G';
  }

  if (StrKey.isValidMed25519PublicKey(address)) {
    return 'M';
  }

  if (StrKey.isValidContractId(address)) {
    return 'C';
  }

  return null;
}