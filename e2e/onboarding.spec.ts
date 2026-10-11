import { test, expect } from "@playwright/test";
import { resetServer } from "./support/app";

test.describe("Onboarding", () => {
  test.beforeEach(async ({ request }) => {
    await resetServer(request);
  });

  test("a first-time visitor is taken to the welcome flow", async ({ page }) => {
    // No seeding: a fresh context has empty storage, which is a new visitor.
    await page.goto("/notes");

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { name: /Let's get started/i })).toBeVisible();
    // The welcome flow deliberately has no app chrome.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  });

  test("the flow cannot be skipped past its two gates", async ({ page }) => {
    await page.goto("/welcome");

    const cont = page.getByRole("button", { name: "Continue", exact: true });
    await expect(cont).toBeDisabled();

    await page.getByLabel("Country of residence").selectOption("IN");
    await page.getByRole("checkbox").check();
    await expect(cont).toBeEnabled();
    await cont.click();

    await page.waitForURL(/welcome\/sign-in/);
    const withEmail = page.getByRole("button", { name: "Continue with email" });
    await expect(withEmail).toBeDisabled();

    await page.getByLabel("Email address").fill("not-an-email");
    await expect(withEmail).toBeDisabled();

    await page.getByLabel("Email address").fill("sayan@example.com");
    await expect(withEmail).toBeEnabled();
  });

  test("completing it lands on My notes and does not ask again", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email address").fill("sayan@example.com");
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.getByRole("button", { name: /Continue into Virasat/i }).click();

    await page.waitForURL(/\/notes$/);

    await page.goto("/notes");
    await expect(page).toHaveURL(/\/notes$/);
  });

  test("an invited Trusted Friend is NOT trapped by the gate", async ({ page, request }) => {
    // The single most important moment in the product: the person opening an
    // invite is not a Virasat user and must never be asked to onboard.
    const created = await request.post("/api/trusted-friends", {
      data: { name: "Meera", email: "meera@example.com" },
    });
    const { friend } = await created.json();

    await page.goto(`/trusted-friends/accept/${friend.inviteToken}`);

    await expect(page).toHaveURL(/\/trusted-friends\/accept\//);
    await expect(page.getByRole("heading", { name: /asked to help/i })).toBeVisible();
  });

  test("a claiming Beneficiary is NOT trapped by the gate", async ({ page }) => {
    await page.goto("/claim");

    await expect(page).toHaveURL(/\/claim$/);
    await expect(page.getByRole("heading", { name: /Notes left in your care/i })).toBeVisible();
  });
});
