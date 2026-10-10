import { test, expect } from "@playwright/test";
import {
  NOMINEE_NOTE,
  gotoUnlocked,
  resetServer,
  seedOnboarded,
} from "./support/app";

/** A small PNG, enough to prove a binary survives the encryption round trip. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function openNewNoteForm(page: import("@playwright/test").Page) {
  await gotoUnlocked(page, "/notes");
  await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
  await page
    .getByRole("link", { name: `Add a note under ${NOMINEE_NOTE.subcategoryLabel}` })
    .click();
  await page.waitForURL(/banks\.nominees\/new/);
}

test.describe("Attachments", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("a file can be attached, and survives save and reopen", async ({ page }) => {
    await openNewNoteForm(page);

    // The inputs are hidden behind the two buttons; the second is "Attach file".
    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: "locker-key-photo.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByText("locker-key-photo.png")).toBeVisible();

    await page.getByLabel("Title").fill("Bank locker");
    await page.getByLabel("Add note").fill("Second key is with Meera.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/banks\.nominees\/note-/);

    // Present on the note, and the text still decrypts alongside it.
    await expect(page.getByText("locker-key-photo.png")).toBeVisible();
    await expect(page.getByText("Second key is with Meera.")).toBeVisible();

    // Still there when the editor is reopened, rather than silently dropped.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("locker-key-photo.png")).toBeVisible();
    await expect(page.getByLabel("Add note")).toHaveValue(/Second key is with Meera/);
  });

  test("the attachment never reaches the server in the clear", async ({ page, request }) => {
    await openNewNoteForm(page);
    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: "passport-scan.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await page.getByLabel("Title").fill("Passport");
    await page.getByLabel("Add note").fill("In the green folder.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/banks\.nominees\/note-/);

    const { items } = await (await request.get("/api/vault")).json();
    const stored = JSON.stringify(items);
    expect(stored).not.toContain("In the green folder");
    // The filename lives inside the encrypted payload too, not on the record.
    expect(stored).not.toContain("passport-scan.png");
    expect(items[0].ciphertextHex.length).toBeGreaterThan(0);
  });

  test("an attachment can be removed without losing the written note", async ({ page }) => {
    await openNewNoteForm(page);
    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: "old-scan.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await page.getByLabel("Title").fill("Policy papers");
    await page.getByLabel("Add note").fill("Keep this text.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/banks\.nominees\/note-/);
    await expect(page.getByText("old-scan.png")).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: /Remove attachment old-scan\.png/i }).click();
    await expect(page.getByText("old-scan.png")).toBeHidden();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Policy papers" })).toBeVisible();
    await expect(page.getByText("Keep this text.")).toBeVisible();
    await expect(page.getByText("old-scan.png")).toBeHidden();
  });
});
