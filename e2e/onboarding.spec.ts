import { test, expect } from "./support/fixtures";
import { OWNER, gotoUnlocked, resetServer, signUp } from "./support/app";

test.describe("Onboarding", () => {
  test.beforeEach(async ({ request }) => {
    await resetServer(request);
  });

  test("a first-time visitor is taken to the welcome flow", async ({ page }) => {
    // No account and nothing on this "phone": a new visitor.
    await page.goto("/notes");

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { name: /Let's get started/i })).toBeVisible();
    // The welcome flow deliberately has no app chrome.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  });

  test("the flow cannot be skipped past its gates", async ({ page }) => {
    await page.goto("/welcome");

    const cont = page.getByRole("button", { name: "Continue", exact: true });
    await expect(cont).toBeDisabled();

    await page.getByLabel("Country of residence").selectOption("IN");
    await page.getByRole("checkbox").check();
    await expect(cont).toBeEnabled();
    await cont.click();

    await page.waitForURL(/welcome\/sign-in/);
    await page.getByRole("button", { name: "I am new to Virasat" }).click();
    const send = page.getByRole("button", { name: "Send me a code" });
    await expect(send).toBeDisabled();

    await page.getByLabel("Email address").fill("not-an-email");
    await expect(send).toBeDisabled();

    await page.getByLabel("Email address").fill("sayan@example.com");
    await expect(send).toBeEnabled();
  });

  test("signing up lands on My notes, and a reload asks for Face ID, not the whole flow", async ({
    page,
  }) => {
    await signUp(page);
    await expect(page).toHaveURL(/\/notes$/);

    await page.goto("/notes");
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("button", { name: "Use Face ID" })).toBeVisible();
    await gotoUnlocked(page, "/notes");
    await expect(page.getByText("Insurance & Cover")).toBeVisible();
  });

  test("an invited Trusted Friend is NOT trapped by the gate", async ({ page, api, browser }) => {
    // The single most important moment in the product: the person opening an
    // invite is not a Virasat user and must never be asked to sign in.
    await signUp(page);
    const created = await api.post("/api/trusted-friends", {
      data: { name: "Meera", email: "meera@example.com" },
    });
    const { friend } = await created.json();

    const theirs = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const theirPage = await theirs.newPage();
    await theirPage.goto(`/trusted-friends/accept/${friend.inviteToken}`);

    await expect(theirPage).toHaveURL(/\/trusted-friends\/accept\//);
    await expect(theirPage.getByRole("heading", { name: /asked to help/i })).toBeVisible();
    await theirs.close();
  });

  test("a Beneficiary is NOT trapped by the gate", async ({ page }) => {
    await page.goto("/claim");

    await expect(page).toHaveURL(/\/claim$/);
    await expect(page.getByRole("heading", { name: /Notes left in your care/i })).toBeVisible();
    await expect(page.getByText(/by email/)).toBeVisible();
  });

  test("the welcome flow does not mention a password-free link any more", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("body")).not.toContainText("there is no password");
    await expect(page.getByText(OWNER.email)).toBeHidden();
  });
});
