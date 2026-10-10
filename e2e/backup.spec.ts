import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  NOMINEE_NOTE,
  createNote,
  gotoUnlocked,
  navigateViaMenu,
  resetServer,
  seedOnboarded,
} from "./support/app";

test.describe("Backup", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("a backup downloads, contains no plaintext, and restores so notes decrypt", async ({
    page,
    request,
  }) => {
    await createNote(page, NOMINEE_NOTE);

    await gotoUnlocked(page, "/notes");
    await navigateViaMenu(page, "Backup", /\/backup$/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Make a new backup/i }).click();
    const download = await downloadPromise;
    const file = await download.path();
    expect(file).toBeTruthy();

    const backup = JSON.parse(readFileSync(file as string, "utf8"));
    expect(backup.format).toBe("virasat-backup");
    expect(backup.notes).toHaveLength(1);

    // The whole point: a file safe to leave on someone else's cloud.
    const raw = JSON.stringify(backup);
    expect(raw).not.toContain("Meera");
    expect(raw).not.toContain("almirah");
    expect(backup.notes[0].ciphertextHex.length).toBeGreaterThan(0);
    expect(backup.notes[0].ivHex.length).toBeGreaterThan(0);

    await expect(page.getByText(/Saved 1 note to virasat-backup-/)).toBeVisible();

    // Lose everything, then restore from the file.
    const { items } = await (await request.get("/api/vault")).json();
    for (const item of items) {
      await request.delete(`/api/vault?id=${encodeURIComponent(item.id)}`);
    }
    expect((await (await request.get("/api/vault")).json()).items).toHaveLength(0);

    await page.setInputFiles('input[type="file"]', file as string);
    await expect(page.getByText(/Restored 1 of 1/)).toBeVisible();

    // The decisive check: restored ciphertext still opens with the passphrase.
    await gotoUnlocked(page, `/notes/${NOMINEE_NOTE.subcategoryId}`);
    await page.getByRole("link", { name: new RegExp(NOMINEE_NOTE.title) }).click();
    await expect(page.getByText(/Nominee is Meera/)).toBeVisible();
  });

  test("a file that is not a Virasat backup is refused", async ({ page }) => {
    await gotoUnlocked(page, "/notes");
    await navigateViaMenu(page, "Backup", /\/backup$/);

    await page.setInputFiles('input[type="file"]', {
      name: "holiday-photos.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ hello: "world" })),
    });

    await expect(page.getByText(/not a Virasat backup/i)).toBeVisible();
  });
});
