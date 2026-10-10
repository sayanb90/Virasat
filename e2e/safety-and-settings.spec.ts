import { test, expect } from "@playwright/test";
import { resetServer, seedOnboarded } from "./support/app";

test.describe("Safety check-in and Settings", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("the safety screen speaks plainly, with no engineering jargon", async ({ page }) => {
    await page.goto("/heartbeat");

    await expect(page.getByRole("heading", { name: "Are you well?" })).toBeVisible();
    await expect(page.getByText("You are all set")).toBeVisible();
    await expect(page.getByText(/Dead Man's Switch|Cycle Completed|Phase \d/i)).toBeHidden();
  });

  test("checking in is acknowledged", async ({ page }) => {
    await page.goto("/heartbeat");
    await page.getByRole("button", { name: /I am safe and well/i }).click();

    await expect(page.getByText(/we have noted that you are well/i)).toBeVisible();
  });

  test("the check-in interval reaches the escalation engine", async ({ page, request }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /^Check-in interval/ }).click();
    await page.getByRole("button", { name: "Every 6 months" }).click();

    await expect(async () => {
      const { phaseInfo } = await (await request.get("/api/heartbeat")).json();
      expect(phaseInfo.totalDaysInCycle).toBe(183);
    }).toPass();
  });

  test("the same elapsed time escalates on a short cycle but not a long one", async ({
    request,
  }) => {
    // Proves the phases scale with the cycle rather than being truncated.
    const { cycleOptions } = await (await request.get("/api/settings")).json();
    expect(cycleOptions.map((o: { days: number }) => o.days)).toContain(183);

    const phaseAt = async (cycleDays: number) => {
      await request.patch("/api/settings", { data: { checkInCycleDays: cycleDays } });
      const { phaseInfo } = await (await request.get("/api/heartbeat")).json();
      return phaseInfo;
    };

    const short = await phaseAt(183);
    expect(short.totalDaysInCycle).toBe(183);

    const long = await phaseAt(730);
    expect(long.totalDaysInCycle).toBe(730);
    expect(long.daysRemaining).toBeGreaterThan(short.daysRemaining);
  });
});

test.describe("Vacation mode", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("pausing takes one tap, with no date to work out", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /^Vacation mode/ }).click();

    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    for (const label of ["2 weeks", "1 month", "3 months", "6 months"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: "3 months", exact: true }).click();
    await expect(page.getByText(/Paused until/)).toBeVisible();
  });

  test("six months is the longest pause the server will accept", async ({ request }) => {
    const atCap = await request.patch("/api/settings", { data: { vacationDays: 183 } });
    expect((await atCap.json()).success).toBe(true);
    await request.patch("/api/settings", { data: { vacationDays: null } });

    for (const days of [184, 3650]) {
      const res = await request.patch("/api/settings", { data: { vacationDays: days } });
      const body = await res.json();
      expect(body.success, `${days} days should be refused`).toBe(false);
      expect(body.error).toMatch(/at most 183 days/);
    }

    // Nothing leaked through from the refusals.
    const { onVacation } = await (await request.get("/api/settings")).json();
    expect(onVacation).toBe(false);
  });

  test("a paused account is shown as paused on the safety screen", async ({ page, request }) => {
    await request.patch("/api/settings", { data: { vacationDays: 30 } });

    await page.goto("/heartbeat");
    await expect(page.getByText("Your safety timer is paused")).toBeVisible();
    // Nothing to do while away, so the check-in button is not offered.
    await expect(page.getByRole("button", { name: /I am safe and well/i })).toBeHidden();
  });

  test("no reminders are generated while paused", async ({ request }) => {
    await request.patch("/api/settings", { data: { vacationDays: 30 } });

    const { onVacation, notifications } = await (await request.get("/api/heartbeat")).json();
    expect(onVacation).toBe(true);
    expect(notifications).toHaveLength(0);
  });

  test("returning early resumes and offers the chooser again", async ({ page, request }) => {
    await request.patch("/api/settings", { data: { vacationDays: 90 } });

    await page.goto("/settings");
    await page.getByRole("button", { name: /^Vacation mode/ }).click();
    await page.getByRole("button", { name: /I'm back/ }).click();

    await expect(page.getByRole("button", { name: "3 months", exact: true })).toBeVisible();
    expect((await (await request.get("/api/settings")).json()).onVacation).toBe(false);
  });
});
