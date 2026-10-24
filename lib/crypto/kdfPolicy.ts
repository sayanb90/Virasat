/**
 * Virasat - The password KDF's settings, shared by the app and the server.
 *
 * The app derives keys with them (lib/crypto/keys.ts). The server checks
 * what it is sent against the floors here, and hands out the same settings
 * for an email it does not know, so prelogin's answer cannot tell anyone
 * whether an account exists. No crypto here, so the server can import it.
 */

/** PBKDF2-SHA256 rounds, for accounts made before Argon2id. */
export const KDF_ITERATIONS = 600_000;

/**
 * Argon2id for new accounts and for every older one at its next sign-in.
 * 64 MiB makes each guess cost memory, which is what GPUs and ASICs lack.
 * Two passes keep a sign-in on an older phone near a second (WebAssembly,
 * one thread).
 */
export const ARGON2ID = { memoryKiB: 65_536, iterations: 2, parallelism: 1 } as const;

/** What the server accepts. The floor is OWASP's (19 MiB, 2 passes). */
export const ARGON2ID_LIMITS = {
  minMemoryKiB: 19_456,
  // Beyond this, a phone may run out of memory signing in.
  maxMemoryKiB: 262_144,
  minIterations: 2,
  maxIterations: 10,
  maxParallelism: 4,
} as const;

export type KdfAlgorithm = "pbkdf2-sha256" | "argon2id";

export interface KdfParams {
  /** Absent on accounts made before Argon2id: PBKDF2. */
  algorithm?: KdfAlgorithm;
  saltHex: string;
  /** PBKDF2 rounds, or Argon2id passes. */
  iterations: number;
  /** Argon2id only. */
  memoryKiB?: number;
  /** Argon2id only. */
  parallelism?: number;
}

export function kdfAlgorithm(kdf: KdfParams): KdfAlgorithm {
  return kdf.algorithm ?? "pbkdf2-sha256";
}

/** Whether these settings should be replaced at the next sign-in. */
export function kdfNeedsUpgrade(kdf: KdfParams): boolean {
  return (
    kdfAlgorithm(kdf) !== "argon2id" ||
    (kdf.memoryKiB ?? 0) < ARGON2ID.memoryKiB ||
    kdf.iterations < ARGON2ID.iterations
  );
}

/** Only the fields that belong to the algorithm: never store what else was sent. */
export function pickKdf(kdf: KdfParams): KdfParams {
  return kdfAlgorithm(kdf) === "argon2id"
    ? {
        algorithm: "argon2id",
        saltHex: kdf.saltHex,
        iterations: kdf.iterations,
        memoryKiB: kdf.memoryKiB,
        parallelism: kdf.parallelism,
      }
    : { saltHex: kdf.saltHex, iterations: kdf.iterations };
}

const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** The server's check on settings an app sends. */
export function isAcceptableKdf(value: unknown): value is KdfParams {
  const v = value as KdfParams;
  if (!v || typeof v.saltHex !== "string" || !/^[0-9a-f]{32}$/.test(v.saltHex)) return false;
  const algorithm = v.algorithm ?? "pbkdf2-sha256";
  if (algorithm === "pbkdf2-sha256") {
    return isInt(v.iterations, KDF_ITERATIONS, 10_000_000) && v.memoryKiB === undefined && v.parallelism === undefined;
  }
  if (algorithm === "argon2id") {
    const L = ARGON2ID_LIMITS;
    return (
      isInt(v.iterations, L.minIterations, L.maxIterations) &&
      isInt(v.memoryKiB, L.minMemoryKiB, L.maxMemoryKiB) &&
      isInt(v.parallelism, 1, L.maxParallelism)
    );
  }
  return false;
}
