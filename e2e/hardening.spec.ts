import { test, expect } from "./support/fixtures";
import { OWNER, gotoUnlocked, navigateViaMenu, resetServer, signUp } from "./support/app";

/**
 * Phase 5 in the browser: Settings → Signing in. The browser harness is one
 * "phone" (IndexedDB keys); alerts exist only in the native app, so they do
 * not appear here.
 */
test.describe("Hardening in Settings", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await signUp(page);
  });

  async function openSigningIn(page: import("@playwright/test").Page) {
    await gotoUnlocked(page, "/notes");
    await navigateViaMenu(page, "Settings", /\/settings$/);
    await page.getByRole("button", { name: /Signing in/ }).click();
  }

  test("this phone is listed, and cannot remove itself", async ({ page }) => {
    await openSigningIn(page);
    const phones = page.getByRole("list", { name: "Phones signed in to Virasat" });
    await expect(phones.getByRole("listitem")).toHaveCount(1);
    await expect(phones).toContainText("This browser");
    await expect(phones).toContainText("(this phone)");
    await expect(phones.getByRole("button", { name: "Remove" })).toHaveCount(0);
    await expect(page.getByText("Alerts on this phone")).toHaveCount(0);
  });

  test("the password changes after the current one is given again, and the new one signs in", async ({ page, browser }) => {
    await openSigningIn(page);
    await page.getByRole("button", { name: "Change my password" }).click();
    await page.getByLabel("Your current password").fill("not-my-password");
    await page.getByLabel("New password", { exact: true }).fill("Brand-New-Password-7");
    await page.getByLabel("Type the new password again").fill("Brand-New-Password-7");
    await page.getByRole("button", { name: "Change my password" }).click();
    await expect(page.getByText("That is not your current password.")).toBeVisible();

    await page.getByLabel("Your current password").fill(OWNER.password);
    await page.getByRole("button", { name: "Change my password" }).click();
    await expect(page.getByText("Your password is changed.")).toBeVisible({ timeout: 20_000 });

    // A second browser: the old password is refused, the new one is not.
    const other = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const signIn = async (password: string) => {
      await other.goto("/welcome/sign-in?existing=1");
      await other.getByLabel("Email address").fill(OWNER.email);
      await other.getByLabel("Password", { exact: true }).fill(password);
      await other.getByRole("button", { name: "Sign in", exact: true }).click();
    };
    await signIn(OWNER.password);
    await expect(other.getByText(/That email and password do not match/)).toBeVisible();
    await signIn("Brand-New-Password-7");
    await expect(other.getByRole("heading", { name: "This is a new phone" })).toBeVisible({ timeout: 20_000 });
    await other.context().close();
  });
});
