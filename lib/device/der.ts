/**
 * Virasat - Native signatures, translated for the server.
 *
 * The server verifies a P-256 ECDSA signature as raw r‖s (IEEE P1363, 64
 * bytes), which is what WebCrypto produces. The Secure Enclave
 * (SecKeyCreateSignature) and Android Keystore (Signature "SHA256withECDSA")
 * both produce ASN.1 DER instead:
 *
 *   30 len  02 rlen r  02 slen s
 *
 * where r and s are big-endian integers that may carry a leading 0x00 (when
 * their top bit is set) or be shorter than 32 bytes (when they are small).
 * Passing DER through unconverted would fail verification on every unlock,
 * and it would fail only on real phones — so the conversion lives here, in
 * TypeScript, where Cucumber tests it against real DER from Node's own
 * ECDSA, rather than in Swift and Kotlin, which this repo cannot compile.
 */

const P256_BYTES = 32;

export function derToRawEcdsaSignature(der: Uint8Array, size = P256_BYTES): Uint8Array {
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`Not a DER ECDSA signature: ${why}`);
  };

  if (der[i++] !== 0x30) fail("expected a SEQUENCE");
  let length = der[i++];
  if (length === undefined) fail("truncated");
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n === 0 || n > 2) fail("bad length");
    length = 0;
    for (let k = 0; k < n; k++) length = (length << 8) | der[i++];
  }
  if (i + length !== der.length) fail("length does not match");

  const readInteger = (): Uint8Array => {
    if (der[i++] !== 0x02) fail("expected an INTEGER");
    const len = der[i++];
    if (!len || i + len > der.length) fail("bad INTEGER length");
    let value = der.slice(i, i + len);
    i += len;
    // A leading 0x00 only marks the number as positive; it is not part of it.
    while (value.length > size && value[0] === 0) value = value.slice(1);
    if (value.length > size) fail("INTEGER too large for the curve");
    const out = new Uint8Array(size);
    out.set(value, size - value.length); // left-pad short values
    return out;
  };

  const r = readInteger();
  const s = readInteger();
  if (i !== der.length) fail("trailing bytes");

  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64ToBytes(b64: string): Uint8Array {
  const normalised = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
