/**
 * The browser harness's storage, with IndexedDB present (fake-indexeddb,
 * which clones values the way a browser does). Its own file: bridge.test.ts
 * checks the behaviour with no IndexedDB at all.
 */
import "fake-indexeddb/auto";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deviceBridge } from "@/lib/device/bridge";
import { finishEnrolment, prepareEnrolment, unlockWithBiometrics } from "@/lib/device/core";
import { randomSecretHex } from "@/lib/crypto/keys";
import { loadBiometrics } from "@/lib/device/useBiometrics";

describe("the browser harness bridge, with IndexedDB", () => {
  test("keeps a device, its CryptoKeys still usable, across a reload", async () => {
    const bridge = deviceBridge();
    const vaultKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = await finishEnrolment(await prepareEnrolment(true, bridge.keys), {
      deviceId: "dev-1",
      email: "meera@example.com",
      serverShareHex: randomSecretHex(),
      vaultKeyBytes,
    });
    await bridge.saveDevice(state);
    const loaded = await bridge.loadDevice();
    assert.ok(loaded);
    assert.equal(loaded!.deviceId, "dev-1");
    // The private keys never left as bytes, yet the stored key still works.
    const unlocked = await unlockWithBiometrics(loaded!, "c", "r", bridge.keys);
    assert.deepEqual(unlocked!.vaultKeyBytes, vaultKeyBytes);
  });

  test("keeps tokens, removes them on null, and forgetting the phone keeps a pending recovery", async () => {
    const bridge = deviceBridge();
    await bridge.saveRefreshToken("rt-1");
    await bridge.saveRecoveryToken("rec-1");
    assert.equal(await bridge.loadRefreshToken(), "rt-1");
    assert.equal(await bridge.loadRecoveryToken(), "rec-1");
    await bridge.saveRecoveryToken(null);
    assert.equal(await bridge.loadRecoveryToken(), null);

    await bridge.saveRecoveryToken("rec-2");
    await bridge.forgetDevice();
    assert.equal(await bridge.loadDevice(), null);
    assert.equal(await bridge.loadRefreshToken(), null);
    assert.equal(await bridge.loadRecoveryToken(), "rec-2");
  });
});

describe("loadBiometrics (behind the useBiometrics hook)", () => {
  test("passes on what the phone says", async () => {
    assert.deepEqual(await loadBiometrics({ biometrics: async () => ({ available: true, label: "Touch ID" }) }), {
      available: true,
      label: "Touch ID",
    });
  });

  test("a phone that cannot answer has nothing to offer, and the wording stays put", async () => {
    const failing = {
      biometrics: async () => {
        throw new Error("plugin missing");
      },
    };
    assert.deepEqual(await loadBiometrics(failing), { available: false, label: "Face ID" });
  });
});

describe("the browser harness bridge, when IndexedDB fails", () => {
  /** An IndexedDB whose every request fails, at the step given. */
  function failingIndexedDB(at: "open" | "get" | "put") {
    const failLater = (target: Record<string, unknown>, handler: string) =>
      setTimeout(() => {
        target.error = new Error(`${at} failed`);
        (target[handler] as (() => void) | undefined)?.();
      });
    const store = {
      get() {
        const req: Record<string, unknown> = {};
        failLater(req, "onerror");
        return req;
      },
      put() {},
      delete() {},
    };
    const db = {
      transaction() {
        const tx: Record<string, unknown> = { objectStore: () => store };
        if (at === "put") failLater(tx, "onerror");
        else setTimeout(() => (tx.oncomplete as (() => void) | undefined)?.());
        return tx;
      },
    };
    return {
      open() {
        const req: Record<string, unknown> = { result: db };
        if (at === "open") failLater(req, "onerror");
        else setTimeout(() => (req.onsuccess as () => void)());
        return req;
      },
    };
  }

  for (const at of ["open", "get", "put"] as const) {
    test(`a failure to ${at} reads as an empty phone and never throws`, async () => {
      const real = globalThis.indexedDB;
      (globalThis as { indexedDB: unknown }).indexedDB = failingIndexedDB(at);
      try {
        const bridge = deviceBridge();
        assert.equal(await bridge.loadRefreshToken(), null);
        await bridge.saveRefreshToken("rt");
        await bridge.forgetDevice();
      } finally {
        (globalThis as { indexedDB: unknown }).indexedDB = real;
      }
    });
  }
});
