/**
 * Virasat - The device bridge inside the iOS and Android apps.
 *
 * A thin binding to the VirasatDevice plugin (ios/App/App/VirasatDevicePlugin.swift,
 * android/app/src/main/java/com/virasat/app/VirasatDevicePlugin.java). The
 * plugin does everything that needs the hardware; this file only converts
 * formats, so the two platforms can return what is natural to them:
 *
 *   - signatures come back DER-encoded (what SecKey and java.security
 *     produce) and are converted to the raw r‖s the server verifies;
 *   - public keys come back as an uncompressed P-256 point (04 ‖ x ‖ y) and
 *     are converted to the JWK the server stores;
 *   - bytes cross the bridge as standard base64.
 *
 * Errors the plugin rejects with code BIOMETRICS_CHANGED become
 * BiometricsChangedError. Cancelling a prompt resolves `{ cancelled: true }`
 * rather than rejecting, because it is not an error.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { bufferToHex, hexToBuffer } from "../crypto/argon2";
import type { PublicKeyJwk, WrappedKey } from "../crypto/keys";
import type { Biometrics, DeviceBridge } from "./bridge";
import { keysOf, type DeviceState } from "./core";
import { base64ToBytes, bytesToBase64, bytesToBase64Url, derToRawEcdsaSignature } from "./der";
import { BiometricsChangedError, isNativeKey, type DeviceKey, type KeyOps } from "./keyops";

/** What the plugin's kind of biometry is called on screen. */
type BiometryKind = "faceId" | "touchId" | "opticId" | "fingerprint" | "face" | "biometric" | "none";

export interface VirasatDevicePlugin {
  biometry(): Promise<{ available: boolean; kind: BiometryKind }>;
  authenticate(options: { reason: string }): Promise<{ cancelled: boolean }>;
  /** `publicKey` is the uncompressed point for a signing key; empty for a wrap key. */
  createKey(options: { alias: string; purpose: "sign" | "wrap"; biometric: boolean }): Promise<{ publicKey: string }>;
  /** A key without a biometric gate. `signature` is DER. */
  sign(options: { alias: string; data: string }): Promise<{ signature: string }>;
  /** Encrypts with the wrap key's public half: no prompt. */
  wrap(options: { alias: string; data: string }): Promise<{ ciphertext: string }>;
  /** One prompt; signs `data` and decrypts `ciphertext`. */
  biometricUnlock(options: {
    signAlias: string;
    wrapAlias: string;
    data: string;
    ciphertext: string;
    reason: string;
  }): Promise<{ cancelled: boolean; signature?: string; plaintext?: string }>;
  deleteKeys(options: { aliases: string[] }): Promise<void>;
  /** Keychain / Keystore-encrypted storage, readable only on this device. */
  getItem(options: { key: string }): Promise<{ value: string | null }>;
  setItem(options: { key: string; value: string }): Promise<void>;
  removeItem(options: { key: string }): Promise<void>;
  deviceName(): Promise<{ name: string }>;
}

const LABELS: Record<BiometryKind, string> = {
  faceId: "Face ID",
  touchId: "Touch ID",
  opticId: "Optic ID",
  fingerprint: "fingerprint",
  face: "face unlock",
  biometric: "fingerprint or face",
  none: "Face ID",
};

const enc = new TextEncoder();

function alias(key: DeviceKey): string {
  if (!isNativeKey(key)) throw new Error("A browser key reached the phone's key operations.");
  return key.alias;
}

/** 04 ‖ x ‖ y → { kty, crv, x, y }. */
export function pointToJwk(point: Uint8Array): PublicKeyJwk {
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("The phone returned a public key that is not an uncompressed P-256 point.");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(point.subarray(1, 33)),
    y: bytesToBase64Url(point.subarray(33, 65)),
  };
}

function rawSignature(derBase64: string): string {
  return bytesToBase64Url(derToRawEcdsaSignature(base64ToBytes(derBase64)));
}

function isBiometricsChanged(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "BIOMETRICS_CHANGED";
}

export function createNativeKeyOps(plugin: VirasatDevicePlugin): KeyOps {
  return {
    async createSigningKey(keyAlias, biometric) {
      const { publicKey } = await plugin.createKey({ alias: keyAlias, purpose: "sign", biometric });
      return { key: { alias: keyAlias }, publicJwk: pointToJwk(base64ToBytes(publicKey)) };
    },
    async createWrapKey(keyAlias, biometric) {
      await plugin.createKey({ alias: keyAlias, purpose: "wrap", biometric });
      return { alias: keyAlias };
    },
    async sign(key, challenge) {
      const { signature } = await plugin.sign({ alias: alias(key), data: bytesToBase64(enc.encode(challenge)) });
      return rawSignature(signature);
    },
    async wrap(key, bytes): Promise<WrappedKey> {
      const { ciphertext } = await plugin.wrap({ alias: alias(key), data: bytesToBase64(bytes) });
      // The hardware's format carries its own nonce; there is no separate IV.
      return { ivHex: "", ciphertextHex: bufferToHex(base64ToBytes(ciphertext)) };
    },
    async biometricUnlock({ signingKey, wrapKey, copy, challenge, reason }) {
      try {
        const result = await plugin.biometricUnlock({
          signAlias: alias(signingKey),
          wrapAlias: alias(wrapKey),
          data: bytesToBase64(enc.encode(challenge)),
          ciphertext: bytesToBase64(hexToBuffer(copy.ciphertextHex)),
          reason,
        });
        if (result.cancelled || !result.signature || !result.plaintext) return null;
        return { signature: rawSignature(result.signature), vaultKeyBytes: base64ToBytes(result.plaintext) };
      } catch (err) {
        if (isBiometricsChanged(err)) throw new BiometricsChangedError();
        throw err;
      }
    },
    async discard(keys) {
      const aliases = keys.filter(isNativeKey).map((k) => k.alias);
      if (aliases.length) await plugin.deleteKeys({ aliases });
    },
  };
}

const ITEM_DEVICE = "device";
const ITEM_REFRESH = "refresh";
const ITEM_RECOVERY = "recovery";

export function createNativeBridgeWith(plugin: VirasatDevicePlugin, platform: "ios" | "android"): DeviceBridge {
  const getItem = async (key: string) => (await plugin.getItem({ key })).value;
  const setItem = async (key: string, value: string | null) => {
    if (value === null) await plugin.removeItem({ key });
    else await plugin.setItem({ key, value });
  };

  let biometrics: Promise<Biometrics> | null = null;

  return {
    platform,
    keys: createNativeKeyOps(plugin),
    biometrics() {
      // Asked again after a failure: the person may have just set Face ID up.
      biometrics ??= plugin
        .biometry()
        .then(({ available, kind }) => ({ available, label: LABELS[kind] ?? LABELS.none }))
        .catch((err) => {
          biometrics = null;
          throw err;
        });
      return biometrics;
    },
    async promptBiometrics(reason) {
      return !(await plugin.authenticate({ reason })).cancelled;
    },
    async loadDevice() {
      const json = await getItem(ITEM_DEVICE);
      // Key references are aliases on a phone, so the state is plain JSON.
      return json ? (JSON.parse(json) as DeviceState) : null;
    },
    saveDevice: (state) => setItem(ITEM_DEVICE, JSON.stringify(state)),
    async forgetDevice() {
      const json = await getItem(ITEM_DEVICE);
      if (json) await createNativeKeyOps(plugin).discard(keysOf(JSON.parse(json) as DeviceState));
      await setItem(ITEM_DEVICE, null);
      await setItem(ITEM_REFRESH, null);
    },
    loadRefreshToken: () => getItem(ITEM_REFRESH),
    saveRefreshToken: (token) => setItem(ITEM_REFRESH, token),
    loadRecoveryToken: () => getItem(ITEM_RECOVERY),
    saveRecoveryToken: (token) => setItem(ITEM_RECOVERY, token),
    async defaultDeviceName() {
      try {
        return (await plugin.deviceName()).name;
      } catch {
        return platform === "ios" ? "iPhone" : "Android phone";
      }
    },
  };
}

/** The bridge for the shipped app. Throws rather than fall back to the browser harness. */
export function createNativeBridge(): DeviceBridge {
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") {
    throw new Error("This build of Virasat runs only inside the iOS or Android app.");
  }
  if (!Capacitor.isPluginAvailable("VirasatDevice")) {
    throw new Error("This build of Virasat is missing its device plugin.");
  }
  return createNativeBridgeWith(registerPlugin<VirasatDevicePlugin>("VirasatDevice"), platform);
}
