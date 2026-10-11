import { test, expect } from "@playwright/test";
import { NOMINEE_NOTE, createNote, resetServer, seedOnboarded } from "./support/app";

test.describe("Handover (claim)", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("nothing is offered while the owner is still checking in", async ({ page }) => {
    await page.goto("/claim");

    await expect(page.getByText("There is nothing to open yet")).toBeVisible();
    await expect(page.getByLabel("Your recovery key")).toBeHidden();
  });

  test("release follows the owner's cycle, not a hardcoded year", async ({ page, request }) => {
    // Regression: this page gated on `simulatedElapsedDays >= 365`. On a
    // six-month cycle it told a Beneficiary there was nothing to open, at
    // exactly the moment the product exists for.
    await createNote(page, NOMINEE_NOTE);

    await request.patch("/api/settings", { data: { checkInCycleDays: 183 } });
    await request.post("/api/scheduler", { data: { action: "set", setToDay: 200 } });

    // 200 days is past a 183-day cycle, so the handover is open...
    const { phaseInfo } = await (await request.get("/api/heartbeat")).json();
    expect(phaseInfo.isTriggered, "200 days should trigger a 183-day cycle").toBe(true);

    await page.goto("/claim");
    await expect(page.getByLabel("Your recovery key")).toBeVisible();

    // ...and the same 200 days on a two-year cycle must stay closed.
    await request.patch("/api/settings", { data: { checkInCycleDays: 730 } });
    await page.goto("/claim");
    await expect(page.getByText("There is nothing to open yet")).toBeVisible();
  });

  // KNOWN FAILURE — a real defect, not a flaky test. Left in place on purpose
  // so it starts passing the moment the envelope scheme is fixed.
  //
  // saveNote() encrypts the note body with the OWNER'S master key
  // (lib/vault/notes.ts), then separately mints a chest key that encrypts
  // nothing, seals that to the Beneficiary and stores it. The Beneficiary
  // therefore holds a key that opens nothing, and cannot read what was left
  // to them. Predates the overhaul: the same shape is in the original
  // AddVaultItemModal at 02c5db3.
  //
  // Fixing it means encrypting the payload with the chest key and wrapping
  // that key twice — once with the owner's master key, once with the
  // Beneficiary's public key. That is a data-model change, so it needs a
  // decision rather than a quiet patch.
  test.fixme("a Beneficiary can open a released note and read it decrypted", async ({
    page,
    request,
  }) => {
    await createNote(page, NOMINEE_NOTE);
    await request.patch("/api/settings", { data: { checkInCycleDays: 183 } });
    await request.post("/api/scheduler", { data: { action: "set", setToDay: 200 } });

    await page.goto("/claim");
    await page.getByLabel("Your recovery key").fill("demo-recovery-key");
    await page.getByRole("button", { name: /Open the notes/i }).click();

    await page.getByRole("button", { name: new RegExp(NOMINEE_NOTE.title) }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Nominee is Meera/)).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });
});
