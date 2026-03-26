export type ErrorCode =
  | "INVALID_CHECKSUM"
  | "INVALID_LENGTH"
  | "INVALID_BASE32"
  | "REJECTED_SEED_KEY"
  | "REJECTED_PREAUTH"
  | "REJECTED_HASH_X"
  | "FEDERATION_ADDRESS_NOT_SUPPORTED"
  | "UNKNOWN_PREFIX";

export class AddressParseError extends Error {
  code: ErrorCode;
  input: string;

  constructor(code: ErrorCode, input: string, message: string) {
    super(message);
    this.name = "AddressParseError";
    this.code = code;
    this.input = input;
    Object.setPrototypeOf(this, AddressParseError.prototype);
  }
}
