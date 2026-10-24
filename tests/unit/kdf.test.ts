import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ARGON2ID,
  ARGON2ID_LIMITS,
  KDF_ITERATIONS,
  isAcceptableKdf,
  kdfAlgorithm,
  kdfNeedsUpgrade,
  pickKdf,
  type KdfParams,
} from "@/lib/crypto/kdfPolicy";
import { deriveAccountKeys, newKdfParams, unwrapBytes, wrapBytes } from "@/lib/crypto/keys";

const SALT = "00112233445566778899aabbccddeeff";
const argon = (o: Partial<KdfParams> = {}): KdfParams => ({ algorithm: "argon2id", saltHex: SALT, ...ARGON2ID, ...o });
const pbkdf2 = (o: Partial<KdfParams> = {}): KdfParams => ({ saltHex: SALT, iterations: KDF_ITERATIONS, ...o });

describe("the KDF settings a server accepts", () => {
  test("new accounts' settings, and older accounts' PBKDF2", () => {
    assert.ok(isAcceptableKdf(newKdfParams()));
    assert.ok(isAcceptableKdf(argon()));
    assert.ok(isAcceptableKdf(pbkdf2()));
    assert.ok(isAcceptableKdf(pbkdf2({ algorithm: "pbkdf2-sha256" })));
  });

  const refused: Array<[string, unknown]> = [
    ["nothing", null],
    ["a short salt", argon({ saltHex: "0011" })],
    ["an upper-case salt", argon({ saltHex: SALT.toUpperCase() })],
    ["PBKDF2 below 600k", pbkdf2({ iterations: KDF_ITERATIONS - 1 })],
    ["PBKDF2 with Argon2 fields", pbkdf2({ memoryKiB: 65536 })],
    ["PBKDF2 with a parallelism", pbkdf2({ parallelism: 1 })],
    ["Argon2id below 19 MiB", argon({ memoryKiB: ARGON2ID_LIMITS.minMemoryKiB - 1 })],
    ["Argon2id above 256 MiB", argon({ memoryKiB: ARGON2ID_LIMITS.maxMemoryKiB + 1 })],
    ["Argon2id with one pass", argon({ iterations: 1 })],
    ["Argon2id with eleven passes", argon({ iterations: 11 })],
    ["Argon2id with no parallelism", argon({ parallelism: 0 })],
    ["Argon2id with five lanes", argon({ parallelism: 5 })],
    ["Argon2id without its memory", argon({ memoryKiB: undefined })],
    ["a fractional pass count", argon({ iterations: 2.5 })],
    ["an unknown algorithm", { ...argon(), algorithm: "scrypt" }],
  ];
  for (const [name, value] of refused) {
    test(`refuses ${name}`, () => assert.equal(isAcceptableKdf(value), false));
  }
  test("accepts the bounds themselves", () => {
    const L = ARGON2ID_LIMITS;
    assert.ok(isAcceptableKdf(argon({ memoryKiB: L.minMemoryKiB, iterations: L.minIterations, parallelism: 1 })));
    assert.ok(isAcceptableKdf(argon({ memoryKiB: L.maxMemoryKiB, iterations: L.maxIterations, parallelism: L.maxParallelism })));
  });
});

describe("pickKdf and kdfNeedsUpgrade", () => {
  test("keep only the algorithm's own fields", () => {
    const sent = { ...argon(), success: true, evil: "x" } as unknown as KdfParams;
    assert.deepEqual(pickKdf(sent), argon());
    assert.deepEqual(pickKdf({ ...pbkdf2(), memoryKiB: 1 } as KdfParams), pbkdf2());
  });

  test("PBKDF2 and weaker Argon2id need upgrading; a new account's do not", () => {
    assert.equal(kdfAlgorithm(pbkdf2()), "pbkdf2-sha256");
    assert.equal(kdfNeedsUpgrade(pbkdf2()), true);
    assert.equal(kdfNeedsUpgrade(argon({ memoryKiB: 19456 })), true);
    assert.equal(kdfNeedsUpgrade(argon({ iterations: 1 })), true);
    assert.equal(kdfNeedsUpgrade(argon()), false);
    assert.equal(kdfNeedsUpgrade(argon({ iterations: 3 })), false);
  });
});

describe("deriving the account keys", () => {
  test("new accounts use Argon2id", () => {
    const kdf = newKdfParams();
    assert.equal(kdf.algorithm, "argon2id");
    assert.match(kdf.saltHex, /^[0-9a-f]{32}$/);
    assert.notEqual(newKdfParams().saltHex, kdf.saltHex);
  });

  test("the same password and settings give the same keys; any change gives others", async () => {
    const a = await deriveAccountKeys("Mango-Tree-Rain-42", argon());
    assert.equal((await deriveAccountKeys("Mango-Tree-Rain-42", argon())).authKeyHex, a.authKeyHex);
    assert.match(a.authKeyHex, /^[0-9a-f]{64}$/);
    for (const other of [
      deriveAccountKeys("Mango-Tree-Rain-43", argon()),
      deriveAccountKeys("Mango-Tree-Rain-42", argon({ saltHex: "ff".repeat(16) })),
      deriveAccountKeys("Mango-Tree-Rain-42", argon({ memoryKiB: 19456 })),
      deriveAccountKeys("Mango-Tree-Rain-42", argon({ iterations: 3 })),
      deriveAccountKeys("Mango-Tree-Rain-42", pbkdf2()),
    ]) {
      assert.notEqual((await other).authKeyHex, a.authKeyHex);
    }
  });

  test("Argon2id fields left out fall back to a new account's", async () => {
    const full = await deriveAccountKeys("pw-pw-pw-pw", argon());
    const sparse = await deriveAccountKeys("pw-pw-pw-pw", { algorithm: "argon2id", saltHex: SALT, iterations: ARGON2ID.iterations });
    assert.equal(sparse.authKeyHex, full.authKeyHex);
  });

  test("the auth key and the wrap key are independent: one cannot open the other's copy", async () => {
    const { authKeyHex, wrapKey } = await deriveAccountKeys("pw-pw-pw-pw", argon());
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapBytes(secret, wrapKey);
    assert.deepEqual(await unwrapBytes(wrapped, wrapKey), secret);
    assert.ok(!wrapped.ciphertextHex.includes(authKeyHex.slice(0, 16)));
    const other = await deriveAccountKeys("pw-pw-pw-pw", pbkdf2());
    await assert.rejects(unwrapBytes(wrapped, other.wrapKey));
  });
});
