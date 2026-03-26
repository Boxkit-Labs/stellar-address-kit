import { decodeMuxed } from "../muxed/decode";
import { detect } from "./detect";
import { ParseResult } from "./types";

export function parse(address: string): ParseResult {
  const up = address.toUpperCase();
  const kind = detect(up);

  if (kind === "invalid") {
    // Check if it's likely a checksum error or unknown prefix
    const first = up[0];
    if (first === "G" || first === "M" || first === "C") {
      return {
        kind: "invalid",
        error: {
          code: "INVALID_CHECKSUM",
          input: address,
          message: "Invalid address checksum",
        },
      };
    }
    return {
      kind: "invalid",
      error: {
        code: "UNKNOWN_PREFIX",
        input: address,
        message: "Invalid address",
      },
    };
  }

  switch (kind) {
    case "G":
      return { kind: "G", address: up, warnings: [] };
    case "C":
      return { kind: "C", address: up, warnings: [] };
    case "M": {
      const decoded = decodeMuxed(up);
      return {
        kind: "M",
        address: up,
        baseG: decoded.baseG,
        muxedId: decoded.id,
        warnings: [],
      };
    }
  }
}
