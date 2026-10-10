import { test, expect } from "@playwright/test";
import { NOMINEE_NOTE, createNote, resetServer, seedOnboarded } from "./support/app";

const SECRET_BODY = "Nominee is Meera. Signed form DA-1 kept in the almirah.";
const WRONG_PASSPHRASE = "not-the-right-passphrase";

test.describe("Passphrase boundary", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("a wrong passphrase cannot read any note body", async ({ page, browser }) => {
    await createNote(page, NOMINEE_NOTE);

    // A different person, a different tab, the wrong passphrase.
    const intruder = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const theirPage = await intruder.newPage();
    await theirPage.addInitScript(() => {
      try {
        window.localStorage.setItem("virasat.onboarded", "true");
      } catch {
        /* storage blocked */
      }
    });

    await theirPage.goto("/notes");
    await theirPage.getByLabel("Your passphrase").fill(WRONG_PASSPHRASE);
    await theirPage.getByRole("button", { name: "Open my notes" }).click();
    await expect(theirPage.getByText("INSURANCE POLICIES")).toBeVisible();

    // Deriving a key from the wrong passphrase cannot fail — it just produces
    // the wrong key — so the boundary that matters is what stays unreadable.
    await theirPage.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await theirPage.getByRole("link", { name: NOMINEE_NOTE.subcategoryLabel, exact: true }).click();
    await expect(theirPage.locator("body")).not.toContainText("almirah");

    await theirPage.getByRole("link", { name: new RegExp(NOMINEE_NOTE.title) }).click();
    await expect(theirPage.getByText(/could not open this note with your current passphrase/i)).toBeVisible();
    await expect(theirPage.locator("body")).not.toContainText("almirah");

    await intruder.close();
  });

  test("the right passphrase still reads it back", async ({ page }) => {
    // Guards the inverse: the test above must fail for the right reason.
    await createNote(page, NOMINEE_NOTE);
    await expect(page.getByText(SECRET_BODY)).toBeVisible();
  });

  test("locking clears the session so the passphrase is needed again", async ({ page }) => {
    await createNote(page, NOMINEE_NOTE);

    await page.goto("/settings");
    await page.getByRole("button", { name: /^Your encryption key/ }).click();
    await page.getByRole("button", { name: /Lock Virasat now/i }).click();

    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByText("INSURANCE POLICIES")).toBeHidden();
  });

  // KNOWN GAP — a real confidentiality defect, not a flaky test.
  //
  // Note titles are stored as plaintext on the record (VaultItemRecord.title),
  // so only the body is encrypted. Anyone who reaches the store, or who
  // unlocks with the wrong passphrase, reads every title: "SBI nomination",
  // "HDFC locker", "Will — Mr Sharma". For this product a title is often as
  // revealing as the body.
  //
  // Fixing it means moving the title inside the encrypted payload and
  // decrypting the list client-side, which changes the data model and how
  // the list renders. That needs a decision, not a quiet patch.
  test.fixme("a wrong passphrase cannot read note titles either", async ({ page, browser }) => {
    await createNote(page, NOMINEE_NOTE);

    const intruder = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const theirPage = await intruder.newPage();
    await theirPage.addInitScript(() => {
      try {
        window.localStorage.setItem("virasat.onboarded", "true");
      } catch {
        /* storage blocked */
      }
    });

    await theirPage.goto("/notes");
    await theirPage.getByLabel("Your passphrase").fill(WRONG_PASSPHRASE);
    await theirPage.getByRole("button", { name: "Open my notes" }).click();
    await theirPage.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await theirPage.getByRole("link", { name: NOMINEE_NOTE.subcategoryLabel, exact: true }).click();

    await expect(theirPage.locator("body")).not.toContainText(NOMINEE_NOTE.title);
    await intruder.close();
  });
});
