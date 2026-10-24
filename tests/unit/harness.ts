/**
 * What the unit tests share: the real API, served in-process, and a fresh
 * copy of the app's client for each test.
 *
 * `fetch` is pointed at the route handlers in app/api, so lib/auth/client.ts
 * talks to the real server flows and the real in-memory store, with no
 * network and no Next.js server.
 */

import path from "node:path";
import { authStore } from "@/lib/auth/store";
import { resetClockForTesting } from "@/lib/auth/clock";
import { resetOutbox } from "@/lib/email/outbox";

const ROOT = path.resolve(__dirname, "..", "..");

type Handler = (req: Request) => Promise<Response> | Response;

/** Requests the client made, newest last: method and path. */
export const requests: string[] = [];

export function serveApiInProcess(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://virasat.test");
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push(`${method} ${url.pathname}`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(ROOT, "app", url.pathname, "route.ts")) as Record<string, Handler>;
    const handler = mod[method];
    if (!handler) return new Response(JSON.stringify({ success: false, error: "no handler" }), { status: 405 });
    return handler(new Request(url, init));
  }) as typeof fetch;
}

export function resetServer(): void {
  authStore.resetForTesting();
  authStore.captureCodesForTesting = true;
  process.env.EMAIL_DRIVER = "console";
  resetClockForTesting();
  resetOutbox();
  requests.length = 0;
}

export function lastCode(email: string): string {
  const code = authStore.lastCodesForTesting.get(email.toLowerCase());
  if (!code) throw new Error(`No code was emailed to ${email}.`);
  return code;
}

/**
 * The client keeps its session in module state. Each test gets its own copy;
 * the bridge module is kept, so a bridge set for testing stays in force.
 */
export function freshClient(): typeof import("@/lib/auth/client") {
  const id = require.resolve(path.join(ROOT, "lib", "auth", "client.ts"));
  delete require.cache[id];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(id);
}

/** The email channel is the console driver; keep test output readable. */
export function quietConsole(): () => void {
  const log = console.log;
  const info = console.info;
  console.log = () => {};
  console.info = () => {};
  return () => {
    console.log = log;
    console.info = info;
  };
}
