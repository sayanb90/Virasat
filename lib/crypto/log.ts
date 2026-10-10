/**
 * Development-only logging for the crypto modules.
 *
 * These modules handle K_master, chest keys, salts and IVs. Logging any of
 * that in a shipped build writes key material straight into the browser
 * console, where a devtools session or a console-capturing error reporter
 * picks it up — and a prefix of K_master next to the salt is a ready-made
 * oracle for confirming a guessed passphrase offline.
 *
 * So two rules, not one:
 *   1. Nothing is logged in a production build at all.
 *   2. Even in development, log only *shapes* — byte lengths, algorithm
 *      names, success or failure. Never a key, a salt, a passphrase or a
 *      prefix of any of them.
 *
 * `console.error` is left in place throughout: it carries failure, not
 * secrets, and losing it would make a decryption bug unreadable.
 */
export const cryptoLog: (...args: unknown[]) => void =
  process.env.NODE_ENV === "production"
    ? () => {}
    : (...args: unknown[]) => console.log("[Virasat Crypto]", ...args);
