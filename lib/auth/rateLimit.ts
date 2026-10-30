/**
 * Virasat - Per-network limits on the routes someone could hammer.
 *
 * The flows already limit per account (five wrong passwords lock the
 * address) and per phone (five wrong PINs delete the server's half of the
 * PIN key). Those do nothing against one network trying many accounts, or
 * filling inboxes with codes. These limits do: each bucket allows so many
 * requests per window from one client address.
 *
 * The client address comes from the proxy in front of the API host, never
 * from the request itself:
 *   CLIENT_IP_HEADER    default x-forwarded-for
 *   TRUSTED_PROXY_HOPS  default 1: how many proxies append to that header.
 *                       The address is read that many entries from the
 *                       right, because anything further left was written
 *                       by the client and can be anything.
 * IPv6 addresses count per /64: one household or phone gets a whole /64 and
 * can rotate through it freely.
 *
 * In memory, like the rest of the store; it moves with persistence.
 */

import { nowMs } from "./clock";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type Bucket = "prelogin" | "login" | "signup" | "code" | "pin" | "recovery" | "social";

/**
 * Generous enough that a person never meets them: a family sharing one
 * network, someone fumbling a code. They exist for scripts.
 */
export const LIMITS: Record<Bucket, { max: number; windowMs: number }> = {
  prelogin: { max: 60, windowMs: 10 * MINUTE },
  login: { max: 20, windowMs: 10 * MINUTE },
  // Each one sends an email.
  signup: { max: 10, windowMs: HOUR },
  code: { max: 30, windowMs: 10 * MINUTE },
  pin: { max: 30, windowMs: 10 * MINUTE },
  recovery: { max: 10, windowMs: HOUR },
  social: { max: 30, windowMs: 10 * MINUTE },
};

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
/** Beyond this many tracked keys, expired windows are swept on the next hit. */
const SWEEP_AT = 10_000;

export function resetRateLimitsForTesting(): void {
  windows.clear();
}

/** One address per client, as the limits count them. */
export function normaliseAddress(raw: string): string {
  let address = raw.trim().toLowerCase();
  if (address.startsWith("[")) address = address.slice(1, address.indexOf("]") > 0 ? address.indexOf("]") : undefined);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(address)) return address.replace(/:\d+$/, "");
  if (!address.includes(":")) return address || "unknown";
  // IPv6: expand "::" and keep the first four groups (the /64).
  const [head, tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = address.includes("::")
    ? [...left, ...new Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export function clientAddress(req: Request, env: Record<string, string | undefined> = process.env): string {
  const header = (env.CLIENT_IP_HEADER || "x-forwarded-for").toLowerCase();
  const value = req.headers.get(header);
  if (!value) return "unknown";
  const entries = value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (!entries.length) return "unknown";
  const hops = Math.max(1, Math.floor(Number(env.TRUSTED_PROXY_HOPS ?? 1)) || 1);
  return normaliseAddress(entries[Math.max(0, entries.length - hops)]);
}

/**
 * Counts one request. Returns null if it is allowed, or how long to wait.
 */
export function hit(bucket: Bucket, address: string): { retryAfterMs: number } | null {
  const now = nowMs();
  if (windows.size > SWEEP_AT) {
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
  }
  const key = `${bucket}|${address}`;
  const limit = LIMITS[bucket];
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + limit.windowMs };
    windows.set(key, w);
  }
  w.count++;
  return w.count > limit.max ? { retryAfterMs: w.resetAt - now } : null;
}

/** For a route handler: a 429 to return, or null to carry on. */
export function limitByAddress(req: Request, bucket: Bucket): Response | null {
  const blocked = hit(bucket, clientAddress(req));
  if (!blocked) return null;
  const seconds = Math.max(1, Math.ceil(blocked.retryAfterMs / 1000));
  const minutes = Math.ceil(seconds / 60);
  return Response.json(
    {
      success: false,
      error: `Too many attempts from this network. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
      retryAfterSeconds: seconds,
    },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}
