import { test, expect } from "@playwright/test";
import { resetServer, seedOnboarded } from "./support/app";

/**
 * The console driver is what runs under test, so nothing leaves the machine.
 * What these specs check is that the app *composed and handed over* the right
 * message — which is the part that was missing entirely before.
 */
test.describe("Email delivery", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("the configuration is reported without ever exposing a key", async ({ request }) => {
    const res = await request.get("/api/email");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.status.driver).toBe("console");
    expect(body.status.ready).toBe(true);

    // `ready` says a key is present; the key itself must never be served.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/re_[A-Za-z0-9]/);
    expect(serialised).not.toMatch(/SG\.[A-Za-z0-9]/);
    expect(serialised.toLowerCase()).not.toContain("api_key");
  });

  test("inviting a Trusted Friend actually sends them the invitation", async ({ page, request }) => {
    await page.goto("/trusted-friends");
    await page.getByRole("button", { name: /Invite someone/i }).click();
    await page.getByLabel("Their name").fill("Meera");
    await page.getByLabel("Their email address").fill("meera@example.com");
    await page.getByRole("button", { name: "Create invitation" }).click();

    await expect(page.getByText("Waiting for them to accept")).toBeVisible();

    const outbox = (await (await request.get("/api/email")).json()).outbox as Array<{
      to: string;
      subject: string;
      status: string;
    }>;

    const invite = outbox.find((e) => e.to === "meera@example.com");
    expect(invite, `No invitation was sent. Outbox: ${JSON.stringify(outbox)}`).toBeTruthy();
    expect(invite!.status).toBe("sent");
    expect(invite!.subject).toMatch(/Trusted Friend/i);
  });

  test("the ladder is sent once, however many times the safety screen is read", async ({
    request,
  }) => {
    // Day 280 of a 365-day cycle sits in the gentle-reminder window, so the
    // ladder genuinely has something due. Without the send ledger, every read
    // of /api/heartbeat would post the whole ladder again.
    await request.post("/api/scheduler", { data: { action: "set", setToDay: 280 } });

    const first = await (await request.get("/api/heartbeat")).json();
    expect(first.emails.sent, "nothing was due, so this proves nothing").toBeGreaterThan(0);
    expect(first.emails.failed).toBe(0);

    const second = await (await request.get("/api/heartbeat")).json();
    const third = await (await request.get("/api/heartbeat")).json();
    expect(second.emails.sent).toBe(0);
    expect(third.emails.sent).toBe(0);
    expect(second.emails.skipped).toBeGreaterThan(0);

    const outbox = (await (await request.get("/api/email")).json()).outbox as Array<{
      to: string;
      subject: string;
    }>;
    expect(outbox.length).toBe(first.emails.sent);
    expect(outbox.every((e) => e.to === "owner@virasat.test")).toBe(true);
  });

  test("a paused account is not chased", async ({ request }) => {
    await request.post("/api/scheduler", { data: { action: "set", setToDay: 280 } });
    await request.patch("/api/settings", { data: { vacationDays: 30 } });

    const res = await (await request.get("/api/heartbeat")).json();
    expect(res.onVacation).toBe(true);
    expect(res.emails.attempted).toBe(0);

    const outbox = (await (await request.get("/api/email")).json()).outbox as unknown[];
    expect(outbox.length).toBe(0);
  });
});
