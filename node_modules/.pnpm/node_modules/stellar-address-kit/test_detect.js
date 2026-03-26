const { StrKey } = require("@stellar/stellar-sdk");

const addr = "ga7qynf7szfx4x7x5jfzz3uq6bxhdsy2rkvkzkx5ffqj1zmzx1";
const up = addr.toUpperCase();
console.log("addr:", addr);
console.log("isValidEd25519PublicKey:", StrKey.isValidEd25519PublicKey(up));
try {
  const decoded = StrKey.decodeEd25519PublicKey(up);
  console.log("Decoded length:", decoded.length);
} catch (e) {
  console.log("Decode error:", e.message);
}
