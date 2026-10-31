import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  derToRawEcdsaSignature,
} from "@/lib/device/der";

/** 30 len 02 rlen r 02 slen s, from raw integer bytes. */
function der(r: number[], s: number[]): Uint8Array {
  const body = [0x02, r.length, ...r, 0x02, s.length, ...s];
  return Uint8Array.from([0x30, body.length, ...body]);
}

const fill = (n: number, v: number) => new Array<number>(n).fill(v);

describe("derToRawEcdsaSignature", () => {
  test("Node's own DER signatures convert to P1363 and verify, across many keys", () => {
    // Leading-zero integers occur in about half of all signatures; short
    // ones (1 in 256) are too rare to rely on here and have their own test.
    let padded = 0;
    for (let i = 0; i < 400; i++) {
      const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const message = Buffer.from(`challenge-${i}`);
      const derSig = sign("sha256", message, { key: privateKey, dsaEncoding: "der" });
      if (derSig[3] === 33) padded++;
      const raw = derToRawEcdsaSignature(derSig);
      assert.equal(raw.length, 64);
      assert.ok(verify("sha256", message, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw), `run ${i}`);
    }
    assert.ok(padded > 0, "no leading-zero integers were exercised");
  });

  test("strips the sign byte and left-pads a short integer", () => {
    const r = [0x00, 0x80, ...fill(31, 0x11)]; // 33 bytes, sign byte
    const s = [0x05]; // 1 byte
    const raw = derToRawEcdsaSignature(der(r, s));
    assert.deepEqual([...raw.subarray(0, 32)], [0x80, ...fill(31, 0x11)]);
    assert.deepEqual([...raw.subarray(32)], [...fill(31, 0), 0x05]);
  });

  test("accepts the long form of the sequence length", () => {
    const short = der(fill(32, 1), fill(32, 2));
    const body = short.subarray(2);
    const long = Uint8Array.from([0x30, 0x81, body.length, ...body]);
    assert.deepEqual(derToRawEcdsaSignature(long), derToRawEcdsaSignature(short));
  });

  test("honours another curve size", () => {
    const raw = derToRawEcdsaSignature(der(fill(48, 3), fill(48, 4)), 48);
    assert.equal(raw.length, 96);
  });

  const malformed: Array<[string, Uint8Array, RegExp]> = [
    ["not a sequence", Uint8Array.from([0x31, 0x00]), /expected a SEQUENCE/],
    ["empty", new Uint8Array(0), /expected a SEQUENCE/],
    ["truncated after the tag", Uint8Array.from([0x30]), /truncated/],
    ["length of length zero", Uint8Array.from([0x30, 0x80]), /bad length/],
    ["length of length too big", Uint8Array.from([0x30, 0x83, 0, 0, 6]), /bad length/],
    ["length mismatch", Uint8Array.from([0x30, 0x10, 0x02, 0x01, 0x01]), /length does not match/],
    ["not an integer", Uint8Array.from([0x30, 0x06, 0x03, 0x01, 0x01, 0x02, 0x01, 0x01]), /expected an INTEGER/],
    ["zero-length integer", Uint8Array.from([0x30, 0x05, 0x02, 0x00, 0x02, 0x01, 0x01]), /bad INTEGER length/],
    ["integer runs past the end", Uint8Array.from([0x30, 0x03, 0x02, 0x05, 0x01]), /bad INTEGER length/],
    ["integer too large", der(fill(33, 0x7f), [1]), /too large/],
    ["trailing bytes", Uint8Array.from([0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01, 0xff]), /trailing bytes/],
    ["missing s", Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x01]), /expected an INTEGER/],
  ];
  for (const [name, input, error] of malformed) {
    test(`refuses: ${name}`, () => {
      assert.throws(() => derToRawEcdsaSignature(input), error);
    });
  }

  test("refuses a raw signature passed by mistake", () => {
    assert.throws(() => derToRawEcdsaSignature(new Uint8Array(64).fill(7)), /Not a DER ECDSA signature/);
  });
});

describe("base64 helpers", () => {
  test("round-trip every byte value, standard and URL-safe", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    assert.deepEqual(base64ToBytes(bytesToBase64(all)), all);
    assert.deepEqual(base64ToBytes(bytesToBase64Url(all)), all);
    assert.equal(bytesToBase64(all), Buffer.from(all).toString("base64"));
    assert.equal(bytesToBase64Url(all), Buffer.from(all).toString("base64url"));
  });

  test("decode unpadded input of every length", () => {
    for (let n = 0; n < 8; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => 250 - i);
      assert.deepEqual(base64ToBytes(Buffer.from(bytes).toString("base64url")), bytes);
    }
  });
});
