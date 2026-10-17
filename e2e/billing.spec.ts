import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { resetServer } from "./support/app";

/**
 * The stub driver runs under test, so no money moves and no provider is
 * contacted. What these specs prove is the part that must never be wrong:
 * an unsigned or tampered webhook changes nothing, and a retried one is not
 * applied twice.
 */
const SECRET = "stub-webhook-secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function event(id: string) {
  return JSON.stringify({ id, event: "payment.captured", reference: "acct-42" });
}

test.describe("Billing webhooks", () => {
  test.beforeEach(async ({ request }) => {
    await resetServer(request);
  });

  test("configuration is reported without ever exposing a credential", async ({ request }) => {
    const res = await request.get("/api/billing");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.status.driver).toBe("stub");
    expect(body.status.ready).toBe(true);

    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/rzp_live/);
    expect(serialised).not.toMatch(/whsec_/);
    expect(serialised.toLowerCase()).not.toContain("key_secret");
  });

  test("an unsigned webhook is refused", async ({ request }) => {
    const res = await request.post("/api/billing/webhook", {
      headers: { "content-type": "application/json" },
      data: event("evt_unsigned"),
    });
    expect(res.status()).toBe(401);
  });

  test("a tampered body is refused even with a valid-looking signature", async ({ request }) => {
    const original = event("evt_tampered");
    const signature = sign(original);

    const res = await request.post("/api/billing/webhook", {
      headers: { "content-type": "application/json", "x-stub-signature": signature },
      // Same signature, different body — the exact shape of an attack.
      data: original.replace("acct-42", "acct-99"),
    });
    expect(res.status()).toBe(401);

    const { ledger } = await (await request.get("/api/billing")).json();
    expect(ledger.filter((e: { outcome: string }) => e.outcome === "applied")).toHaveLength(0);
  });

  test("a genuine webhook is accepted, and a retry of it is not applied again", async ({
    request,
  }) => {
    const body = event("evt_genuine");
    const headers = { "content-type": "application/json", "x-stub-signature": sign(body) };

    const first = await request.post("/api/billing/webhook", { headers, data: body });
    expect(first.status()).toBe(200);
    expect((await first.json()).replayed).toBeFalsy();

    // Providers retry. The same event must not be applied twice.
    const second = await request.post("/api/billing/webhook", { headers, data: body });
    expect(second.status()).toBe(200);
    expect((await second.json()).replayed).toBe(true);

    const { ledger } = await (await request.get("/api/billing")).json();
    expect(ledger.filter((e: { outcome: string }) => e.outcome === "applied")).toHaveLength(1);
  });
});
