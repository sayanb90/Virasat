/**
 * Every API route, checked from outside: who may call it, and what a caller
 * without the right session gets back.
 *
 * The routes are found on disk, so a new route.ts (or a new method in one)
 * fails here until it is added to ROUTES with the rule it follows. Nothing
 * can be added to the API open by accident.
 */

// The browser crypto helpers reach for window.crypto.
const g = globalThis as { window?: unknown };
if (!g.window) g.window = globalThis;

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as flows from "@/lib/auth/flows";
import { authStore } from "@/lib/auth/store";
import { buildNewAccount, buildRecoveryKit, loginProof } from "@/lib/crypto/account";
import { resetVaultsForTesting, vaultFor } from "@/lib/state/mockDatabase";
import { record as recordEmail } from "@/lib/email/outbox";
import { record as recordLedger, resetLedger } from "@/lib/billing/ledger";
import { quietConsole, resetServer } from "./harness";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * owner    a signed-in, unlocked Owner (requireSession's default)
 * pending  signed in, still confirming the phone (code, PIN, Face ID)
 * reset    a password reset or Recovery Kit recovery in progress
 * session  any session at all (reading it, ending it)
 * public   no session by design; each says what it checks instead
 * test     the test harness only: 404 unless VIRASAT_E2E=1
 */
type Rule = "owner" | "pending" | "reset" | "session" | "public" | "test";
/** `answersAnyone`: needs nothing at all, and answers with nothing about anyone. */
type Entry = Rule | { rule: "public"; because: string; answersAnyone?: string[] };

const ROUTES: Record<string, Partial<Record<(typeof METHODS)[number], Entry>>> = {
  "/api/audit": { GET: "owner" },
  "/api/beneficiaries": { GET: "owner", POST: "owner", DELETE: "owner" },
  "/api/billing": { GET: "owner" },
  "/api/email": { GET: "owner" },
  "/api/heartbeat": { GET: "owner", POST: "owner" },
  "/api/inherited": { GET: "owner" },
  "/api/push/register": { POST: "owner" },
  "/api/settings": { GET: "owner", PATCH: "owner" },
  "/api/trusted-friends": { GET: "owner", POST: "owner", DELETE: "owner" },
  "/api/vault": { GET: "owner", POST: "owner", DELETE: "owner" },
  "/api/auth/devices": { GET: "owner", DELETE: "owner" },
  "/api/auth/device/enrol": { POST: "owner" },
  "/api/auth/extend": { POST: "owner" },
  "/api/auth/password/change": { POST: "owner" },
  "/api/auth/password/upgrade": { POST: "owner" },
  "/api/auth/recovery-kit": { PUT: "owner" },

  "/api/auth/code": { POST: "pending" },
  "/api/auth/code/resend": { POST: "pending" },
  "/api/auth/device/challenge": { POST: "pending" },
  "/api/auth/device/prove": { POST: "pending" },

  "/api/auth/password/reset": { POST: "reset" },
  "/api/auth/recovery/kit/begin": { POST: "reset" },

  "/api/auth/session": { GET: "session" },
  "/api/auth/logout": { POST: "session" },

  "/api/auth/prelogin": { POST: { rule: "public", because: "Answers the KDF settings for any address, real or not, so it reveals nothing" } },
  "/api/auth/login": { POST: { rule: "public", because: "Checks the password proof; a new phone still needs the emailed code" } },
  "/api/auth/signup/start": { POST: { rule: "public", because: "Sends a code to the address; nothing is created" } },
  "/api/auth/signup/verify": { POST: { rule: "public", because: "Checks the emailed code" } },
  "/api/auth/signup/complete": { POST: { rule: "public", because: "Needs the ticket from a verified code" } },
  "/api/auth/social/nonce": { POST: { rule: "public", because: "A random single-use nonce for a provider sheet, limited per network", answersAnyone: ["nonce"] } },
  "/api/auth/social": { POST: { rule: "public", because: "Checks the provider's signed token" } },
  "/api/auth/refresh": { POST: { rule: "public", because: "Needs a refresh token bound to its phone" } },
  "/api/auth/recovery/device/start": { POST: { rule: "public", because: "Emails a link to the address; reveals nothing" } },
  "/api/auth/recovery/kit/start": { POST: { rule: "public", because: "Needs the Recovery Kit code" } },
  "/api/auth/recovery/kit/status": { POST: { rule: "public", because: "Needs the recovery's own token" } },
  "/api/auth/recovery/kit/complete": { POST: { rule: "public", because: "Needs the recovery token, after the 72-hour hold" } },
  "/api/auth/recovery/kit/cancel": { POST: { rule: "public", because: "Needs the emailed cancel token; it can only delay a recovery" } },
  "/api/billing/webhook": { POST: { rule: "public", because: "Checks the provider's signature" } },
  "/api/trusted-friends/accept": { POST: { rule: "public", because: "The friend has no account; needs the 32-byte invite token" } },

  "/api/scheduler": { POST: "test" },
  "/api/test/clock": { POST: "test" },
  "/api/test/codes": { GET: "test" },
  "/api/test/reset": { GET: "test", POST: "test" },
};

type Handler = (req: Request) => Promise<Response> | Response;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Every exported method of every route.ts under app/api. */
function discovered(): Array<{ route: string; method: string; handler: Handler }> {
  return routeFiles(API).flatMap((file) => {
    const route = "/" + path.relative(path.join(ROOT, "app"), path.dirname(file)).split(path.sep).join("/");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    return METHODS.filter((m) => typeof mod[m] === "function").map((method) => ({
      route,
      method,
      handler: mod[method] as Handler,
    }));
  });
}

function call(handler: Handler, route: string, method: string, token?: string, body: unknown = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return handler(
    new Request(`http://virasat.test${route}?id=someone-elses`, {
      method,
      headers,
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    })
  );
}

const PASSWORD = "Mango-River-Lamp-42";

/** A real account, made through the sign-up flow; signed in and unlocked. */
async function owner(email: string) {
  const started = await flows.startSignup(email);
  assert.ok(started.ok);
  const verified = flows.verifySignupCode({ email, code: authStore.lastCodesForTesting.get(email)! });
  assert.ok(verified.ok);
  const account = await buildNewAccount(PASSWORD);
  const kit = await buildRecoveryKit(account.vaultKeyBytes);
  const done = await flows.completeSignup({
    signupTicket: verified.data.signupTicket,
    name: email.split("@")[0],
    ...account.send,
    recovery: kit.send,
  });
  assert.ok(done.ok);
  assert.equal(done.data.stage, "full");
  return { userId: authStore.usersByEmail.get(email)!, token: done.data.accessToken };
}

/** The same Owner, signing in on a phone that has not been confirmed. */
async function pendingSessionFor(email: string): Promise<string> {
  const kdf = flows.prelogin(email);
  assert.ok(kdf.ok);
  const login = await flows.login({ email, authKeyHex: (await loginProof(PASSWORD, kdf.data)).authKeyHex });
  assert.ok(login.ok);
  assert.equal(login.data.stage, "pending");
  return login.data.accessToken;
}

let restore: () => void;
beforeEach(() => {
  restore = quietConsole();
  resetServer();
  resetVaultsForTesting();
  resetLedger();
  delete process.env.VIRASAT_E2E;
});
afterEach(() => {
  delete process.env.VIRASAT_E2E;
  restore();
});

describe("every API route has a rule", () => {
  test("each route and method on disk is listed, and nothing listed is gone", () => {
    const found = discovered().map((r) => `${r.method} ${r.route}`).sort();
    const listed = Object.entries(ROUTES)
      .flatMap(([route, methods]) => Object.keys(methods).map((m) => `${m} ${route}`))
      .sort();
    assert.deepEqual(
      found.filter((r) => !listed.includes(r)),
      [],
      "a route with no rule: add it to ROUTES"
    );
    assert.deepEqual(listed.filter((r) => !found.includes(r)), [], "listed in ROUTES but not on disk");
  });
});

describe("without a session", () => {
  test("every route that needs one answers 401, with no token and with a made-up one", async () => {
    for (const { route, method, handler } of discovered()) {
      const rule = ROUTES[route]?.[method as (typeof METHODS)[number]];
      if (rule === "owner" || rule === "pending" || rule === "reset" || rule === "session") {
        for (const token of [undefined, "not-a-real-token"]) {
          const res = await call(handler, route, method, token);
          assert.equal(res.status, 401, `${method} ${route} (${token ? "made-up token" : "no token"})`);
          assert.equal((await res.json()).code, "unauthenticated", `${method} ${route}`);
        }
      }
    }
  });

  test("the public routes refuse a request that carries none of what they check", async () => {
    for (const { route, method, handler } of discovered()) {
      const rule = ROUTES[route]?.[method as (typeof METHODS)[number]];
      if (typeof rule !== "object") continue;
      const res = await call(handler, route, method);
      if (rule.answersAnyone) {
        assert.equal(res.status, 200, `${method} ${route}`);
        assert.deepEqual(Object.keys(await res.json()).sort(), ["success", ...rule.answersAnyone].sort(), `${method} ${route}`);
        continue;
      }
      assert.ok(res.status >= 400 && res.status < 500, `${method} ${route} answered ${res.status}`);
      assert.equal((await res.json()).success, false, `${method} ${route}`);
    }
  });

  test("the test harness's routes do not exist outside it, signed in or not", async () => {
    const { token } = await owner("meera@example.com");
    for (const { route, method, handler } of discovered()) {
      if (ROUTES[route]?.[method as (typeof METHODS)[number]] !== "test") continue;
      for (const t of [undefined, token]) {
        assert.equal((await call(handler, route, method, t)).status, 404, `${method} ${route}`);
      }
    }
  });

  test("a signed-out session's token stops working everywhere", async () => {
    const { token } = await owner("meera@example.com");
    flows.logout(flows.sessionForToken(token)!);
    for (const { route, method, handler } of discovered()) {
      if (ROUTES[route]?.[method as (typeof METHODS)[number]] !== "owner") continue;
      assert.equal((await call(handler, route, method, token)).status, 401, `${method} ${route}`);
    }
  });
});

describe("with the wrong kind of session", () => {
  test("a phone still confirming its code cannot reach an Owner's routes", async () => {
    await owner("meera@example.com");
    const pending = await pendingSessionFor("meera@example.com");
    for (const { route, method, handler } of discovered()) {
      if (ROUTES[route]?.[method as (typeof METHODS)[number]] !== "owner") continue;
      const res = await call(handler, route, method, pending);
      assert.equal(res.status, 403, `${method} ${route}`);
      assert.equal((await res.json()).code, "locked", `${method} ${route}`);
    }
  });

  test("an unlocked Owner cannot use the steps meant for confirming a phone or resetting", async () => {
    const { token } = await owner("meera@example.com");
    for (const { route, method, handler } of discovered()) {
      const rule = ROUTES[route]?.[method as (typeof METHODS)[number]];
      if (rule !== "pending" && rule !== "reset") continue;
      assert.equal((await call(handler, route, method, token)).status, 403, `${method} ${route}`);
    }
  });
});

describe("one Owner, another Owner's data", () => {
  async function twoOwners() {
    const meera = await owner("meera@example.com");
    const arjun = await owner("arjun@example.com");
    const vault = vaultFor(meera.userId);
    vault.addVaultItem({
      id: "note-meera",
      title: "SBI nomination",
      subcategoryId: "banks.nominees",
      mimeType: "text/plain",
      ciphertextHex: "ab",
      ivHex: "cd",
      encryptedChestKeyHex: "ef",
      createdAt: "t",
      updatedAt: "t",
      assignedBeneficiaryIds: [],
    });
    vault.addBeneficiary({
      id: "ben-meera",
      name: "Ravi",
      relationship: "Son",
      email: "ravi@example.com",
      publicKeyPem: "pem",
      status: "Active",
      createdAt: "t",
    });
    vault.addTrustedFriend({
      id: "friend-meera",
      name: "Priya",
      email: "priya@example.com",
      status: "Invited",
      inviteToken: "invite-meera",
      createdAt: "t",
    } as never);
    return { meera, arjun };
  }

  const handler = (route: string, method: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require(path.join(ROOT, "app", route, "route.ts")) as Record<string, Handler>)[method];

  async function get(route: string, token: string) {
    return (await handler(route, "GET")(new Request(`http://virasat.test${route}`, { headers: { authorization: `Bearer ${token}` } }))).json();
  }

  async function del(route: string, id: string, token: string) {
    const res = await handler(route, "DELETE")(
      new Request(`http://virasat.test${route}?id=${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } })
    );
    return res.json();
  }

  test("reads only their own notes, Beneficiaries and Trusted Friends", async () => {
    const { meera, arjun } = await twoOwners();
    assert.equal((await get("/api/vault", arjun.token)).count, 0);
    assert.deepEqual((await get("/api/beneficiaries", arjun.token)).beneficiaries, []);
    assert.deepEqual((await get("/api/trusted-friends", arjun.token)).friends, []);
    assert.equal((await get("/api/vault", meera.token)).count, 1, "the owner still sees hers");
    assert.equal((await get("/api/beneficiaries", meera.token)).beneficiaries.length, 1);
    assert.equal((await get("/api/trusted-friends", meera.token)).friends.length, 1);
  });

  test("cannot delete them by id", async () => {
    const { meera, arjun } = await twoOwners();
    assert.equal((await del("/api/vault", "note-meera", arjun.token)).success, false);
    assert.equal((await del("/api/beneficiaries", "ben-meera", arjun.token)).success, false);
    assert.equal((await del("/api/trusted-friends", "friend-meera", arjun.token)).success, false);
    const vault = vaultFor(meera.userId);
    assert.equal(vault.getVaultItems().length, 1);
    assert.equal(vault.getBeneficiaries().length, 1);
    assert.equal(vault.getTrustedFriends().length, 1);
  });

  test("never sees anyone's email or payment records", async () => {
    const { arjun } = await twoOwners();
    recordEmail({ idempotencyKey: "k", to: "ravi@example.com", subject: "Meera left something for you", driver: "console", status: "sent", at: "t" });
    recordLedger({ eventId: "evt_1", type: "payment.captured", reference: "meera", outcome: "applied", at: "t" });
    const email = await get("/api/email", arjun.token);
    const billing = await get("/api/billing", arjun.token);
    assert.ok(email.status && !("outbox" in email), JSON.stringify(email));
    assert.ok(billing.status && !("ledger" in billing), JSON.stringify(billing));

    process.env.VIRASAT_E2E = "1";
    const outbox = (await get("/api/email", arjun.token)).outbox as Array<{ subject: string }>;
    assert.ok(outbox.some((m) => m.subject === "Meera left something for you"), "the test harness still reads them");
    assert.equal((await get("/api/billing", arjun.token)).ledger.length, 1);
  });
});
