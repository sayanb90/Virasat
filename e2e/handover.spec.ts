import { test, expect } from "./support/fixtures";
import { NOMINEE_NOTE, createNote, resetServer, signUp } from "./support/app";

test.describe("Handover", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await signUp(page);
  });

  test("release follows the owner's cycle, not a hardcoded year", async ({ page, api }) => {
    // Regression: release once gated on `simulatedElapsedDays >= 365`. On a
    // six-month cycle it told a Beneficiary there was nothing to open, at
    // exactly the moment the product exists for.
    await createNote(page, NOMINEE_NOTE);

    await api.patch("/api/settings", { data: { checkInCycleDays: 183 } });
    await api.post("/api/scheduler", { data: { action: "set", setToDay: 200 } });

    // 200 days is past a 183-day cycle, so the handover is open...
    let { phaseInfo } = await (await api.get("/api/heartbeat")).json();
    expect(phaseInfo.isTriggered, "200 days should trigger a 183-day cycle").toBe(true);

    // ...and the same 200 days on a two-year cycle must stay closed.
    await api.patch("/api/settings", { data: { checkInCycleDays: 730 } });
    ({ phaseInfo } = await (await api.get("/api/heartbeat")).json());
    expect(phaseInfo.isTriggered).toBe(false);
  });

  test("a Beneficiary is told the notes come by email, with no sign-in", async ({ browser }) => {
    const theirs = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await theirs.newPage();
    await page.goto("/claim");
    await expect(page.getByText(/one email with the notes as a locked PDF/)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeHidden();
    await theirs.close();
  });

  // NOT BUILT YET — phase 3b of docs/authentication.md.
  //
  // Notes reach a Beneficiary by email as a password-protected PDF, with the
  // handover code in a separate email, rebuilt from a Witness piece and a
  // Beneficiary piece. Until then nothing delivers the notes at all. The
  // earlier /claim page "worked" only because it read the Owner's vault
  // without signing in, which accounts have rightly ended.
  test.fixme("a Beneficiary receives the released notes by email and can open them", async () => {});
});
