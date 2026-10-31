import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import {
  BiometricsChangedError,
  createWebCryptoKeyOps,
  isNativeKey,
  webCryptoKeyOps,
} from "@/lib/device/keyops";
import { base64ToBytes } from "@/lib/device/der";

describe("webCryptoKeyOps (the browser harness)", () => {
  test("a signing key's signatures verify against its JWK, as the server checks them", async () => {
    const { key, publicJwk } = await webCryptoKeyOps.createSigningKey("ignored", false);
    assert.equal(publicJwk.kty, "EC");
    assert.equal(publicJwk.crv, "P-256");
    const signature = await webCryptoKeyOps.sign(key, "hello");
    const pub = createPublicKey({ key: publicJwk, format: "jwk" });
    assert.ok(verify("sha256", Buffer.from("hello"), { key: pub, dsaEncoding: "ieee-p1363" }, base64ToBytes(signature)));
  });

  test("wrap, then biometric unlock, returns the same bytes and a valid signature", async () => {
    const { key: signingKey, publicJwk } = await webCryptoKeyOps.createSigningKey("s", true);
    const wrapKey = await webCryptoKeyOps.createWrapKey("w", true);
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const copy = await webCryptoKeyOps.wrap(wrapKey, secret);
    assert.notEqual(copy.ivHex, "");
    const result = await webCryptoKeyOps.biometricUnlock({ signingKey, wrapKey, copy, challenge: "c", reason: "r" });
    assert.ok(result);
    assert.deepEqual(result!.vaultKeyBytes, secret);
    const pub = createPublicKey({ key: publicJwk, format: "jwk" });
    assert.ok(verify("sha256", Buffer.from("c"), { key: pub, dsaEncoding: "ieee-p1363" }, base64ToBytes(result!.signature)));
  });

  test("the prompt it is given decides; a cancelled prompt opens nothing", async () => {
    const reasons: string[] = [];
    const ops = createWebCryptoKeyOps(async (reason) => {
      reasons.push(reason);
      return false;
    });
    const { key: signingKey } = await ops.createSigningKey("s", true);
    const wrapKey = await ops.createWrapKey("w", true);
    const copy = await ops.wrap(wrapKey, new Uint8Array(32));
    assert.equal(await ops.biometricUnlock({ signingKey, wrapKey, copy, challenge: "c", reason: "Open your notes" }), null);
    assert.deepEqual(reasons, ["Open your notes"]);
  });

  test("the default prompt says yes, as the harness's stand-in does", async () => {
    const ops = createWebCryptoKeyOps();
    const { key: signingKey } = await ops.createSigningKey("s", true);
    const wrapKey = await ops.createWrapKey("w", true);
    const copy = await ops.wrap(wrapKey, new Uint8Array(32));
    assert.ok(await ops.biometricUnlock({ signingKey, wrapKey, copy, challenge: "c", reason: "r" }));
  });

  test("a phone's key reference is refused rather than misused", async () => {
    await assert.rejects(webCryptoKeyOps.sign({ alias: "virasat.x.signing" }, "c"), /hardware key reached the browser/);
    await assert.rejects(webCryptoKeyOps.wrap({ alias: "virasat.x.wrap" }, new Uint8Array(1)), /hardware key/);
  });

  test("discard is a no-op: CryptoKeys go with the state that held them", async () => {
    const { key } = await webCryptoKeyOps.createSigningKey("s", false);
    await webCryptoKeyOps.discard([key, { alias: "a" }]);
  });
});

describe("key references", () => {
  test("isNativeKey tells an alias from a CryptoKey", async () => {
    const { key } = await webCryptoKeyOps.createSigningKey("s", false);
    assert.equal(isNativeKey(key), false);
    assert.equal(isNativeKey({ alias: "virasat.x.signing" }), true);
  });

  test("BiometricsChangedError says to use the PIN and how to turn Face ID back on", () => {
    const err = new BiometricsChangedError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, "BiometricsChangedError");
    assert.match(err.message, /PIN/);
    assert.match(err.message, /Settings/);
  });
});
