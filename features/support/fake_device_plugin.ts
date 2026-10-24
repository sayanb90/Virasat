/**
 * A stand-in for the VirasatDevice plugin, for Cucumber.
 *
 * It returns exactly the formats the real plugins do — DER signatures, an
 * uncompressed P-256 point, an opaque wrap blob, standard base64 — using
 * Node's own crypto, so lib/device/native.ts is tested against real encodings
 * rather than against itself. It also models what the hardware decides:
 * a cancelled prompt, and biometric keys invalidated by a new face.
 *
 * The real plugins live in ios/App/App/VirasatDevicePlugin.swift and
 * android/app/src/main/java/com/virasat/app/VirasatDevicePlugin.java.
 */

import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  sign as nodeSign,
  type KeyObject,
} from "node:crypto";
import type { VirasatDevicePlugin } from "../../lib/device/native";

interface HardwareKey {
  purpose: "sign" | "wrap";
  biometric: boolean;
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** The biometric set the key was made under. A new face invalidates it. */
  enrolment: number;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (value: string) => Buffer.from(value, "base64");

function uncompressedPoint(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: "jwk" });
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
}

function rejection(message: string, code: string): Error {
  // Capacitor rejects with an error that carries the plugin's code.
  return Object.assign(new Error(message), { code });
}

export class FakeDevicePlugin implements VirasatDevicePlugin {
  readonly keys = new Map<string, HardwareKey>();
  readonly items = new Map<string, string>();
  /** How many signatures the hardware has made. */
  signatures = 0;
  prompts = 0;
  cancelNextPrompt = false;
  private biometricEnrolment = 1;

  /** Someone adds a face or fingerprint in the phone's settings. */
  addFace(): void {
    this.biometricEnrolment++;
  }

  private key(alias: string, purpose: HardwareKey["purpose"]): HardwareKey {
    const key = this.keys.get(alias);
    if (!key || key.purpose !== purpose) throw rejection(`No ${purpose} key ${alias}`, "KEY_ERROR");
    if (key.biometric && key.enrolment !== this.biometricEnrolment) {
      throw rejection("Biometrics have changed on this phone.", "BIOMETRICS_CHANGED");
    }
    return key;
  }

  private signWith(key: HardwareKey, data: string): string {
    this.signatures++;
    return b64(nodeSign("sha256", unb64(data), { key: key.privateKey, dsaEncoding: "der" }));
  }

  private prompt(): boolean {
    this.prompts++;
    const cancelled = this.cancelNextPrompt;
    this.cancelNextPrompt = false;
    return !cancelled;
  }

  async biometry() {
    return { available: true, kind: "faceId" as const };
  }

  async authenticate() {
    return { cancelled: !this.prompt() };
  }

  async createKey({ alias, purpose, biometric }: { alias: string; purpose: "sign" | "wrap"; biometric: boolean }) {
    const pair =
      purpose === "sign"
        ? generateKeyPairSync("ec", { namedCurve: "P-256" })
        : generateKeyPairSync("rsa", { modulusLength: 2048 });
    this.keys.set(alias, { purpose, biometric, ...pair, enrolment: this.biometricEnrolment });
    return { publicKey: purpose === "sign" ? b64(uncompressedPoint(pair.publicKey)) : "" };
  }

  async sign({ alias, data }: { alias: string; data: string }) {
    const key = this.key(alias, "sign");
    if (key.biometric) throw rejection("A biometric key signs only after the prompt.", "KEY_ERROR");
    return { signature: this.signWith(key, data) };
  }

  async wrap({ alias, data }: { alias: string; data: string }) {
    const key = this.key(alias, "wrap");
    const ciphertext = publicEncrypt(
      { key: key.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      unb64(data)
    );
    return { ciphertext: b64(ciphertext) };
  }

  async biometricUnlock(options: { signAlias: string; wrapAlias: string; data: string; ciphertext: string }) {
    // The real plugins check the keys before prompting, so a person is not
    // asked for a face that can no longer open anything.
    const signKey = this.key(options.signAlias, "sign");
    const wrapKey = this.key(options.wrapAlias, "wrap");
    if (!this.prompt()) return { cancelled: true };
    const plaintext = privateDecrypt(
      { key: wrapKey.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      unb64(options.ciphertext)
    );
    return { cancelled: false, signature: this.signWith(signKey, options.data), plaintext: b64(plaintext) };
  }

  async deleteKeys({ aliases }: { aliases: string[] }) {
    for (const alias of aliases) this.keys.delete(alias);
  }

  async getItem({ key }: { key: string }) {
    return { value: this.items.get(key) ?? null };
  }

  async setItem({ key, value }: { key: string; value: string }) {
    this.items.set(key, value);
  }

  async removeItem({ key }: { key: string }) {
    this.items.delete(key);
  }

  async deviceName() {
    return { name: "Test iPhone" };
  }
}
