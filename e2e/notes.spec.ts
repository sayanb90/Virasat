import { test, expect } from "@playwright/test";
import {
  NOMINEE_NOTE,
  createNote,
  gotoUnlocked,
  resetServer,
  seedOnboarded,
} from "./support/app";

test.describe("Notes", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("notes are locked until the passphrase is given", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByText("INSURANCE POLICIES")).toBeHidden();

    await page.getByRole("button", { name: /Open my notes/i }).click();
    await expect(page.getByText("INSURANCE POLICIES")).toBeVisible();
  });

  test("the India pack's vocabulary is what a user actually sees", async ({ page }) => {
    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: /banks and financial/i }).click();

    await expect(page.getByRole("link", { name: "Nominee Details", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Retirement and Provident Funds", exact: true })
    ).toBeVisible();
    await expect(page.getByText(/EPF \(and your UAN\), PPF, NPS/)).toBeVisible();
  });

  test("a note can be written, saved and read back decrypted", async ({ page }) => {
    await createNote(page, NOMINEE_NOTE);

    await expect(page.getByRole("heading", { name: NOMINEE_NOTE.title })).toBeVisible();
    await expect(page.getByText(/Nominee is Meera/)).toBeVisible();
  });

  test("editing a note updates it in place and does not create a duplicate", async ({ page }) => {
    // Regression: POST /api/vault used to mint a new id on every save, so an
    // edit silently produced a second note and lost the original createdAt.
    await createNote(page, NOMINEE_NOTE);

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Add note")).toHaveValue(/Nominee is Meera/);

    await page.getByLabel("Title").fill("SBI nomination (joint)");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: "SBI nomination (joint)" })).toBeVisible();

    await gotoUnlocked(page, `/notes/${NOMINEE_NOTE.subcategoryId}`);
    const cards = page.locator(`li a[href*="/notes/${NOMINEE_NOTE.subcategoryId}/note-"]`);
    await expect(cards).toHaveCount(1);
  });

  test("a note can be deleted", async ({ page }) => {
    await createNote(page, NOMINEE_NOTE);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Delete this note/i }).click();

    await page.waitForURL(new RegExp(`/notes/${NOMINEE_NOTE.subcategoryId}$`));
    await expect(page.getByText("Nothing here yet")).toBeVisible();
  });

  test("the recipient chooser stays hidden with one Beneficiary", async ({ page }) => {
    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await page
      .getByRole("link", { name: `Add a note under ${NOMINEE_NOTE.subcategoryLabel}` })
      .click();

    await expect(page.getByLabel("Who should receive this?")).toBeHidden();
  });

  test("with two Beneficiaries the recipient can be chosen and survives an edit", async ({
    page,
    request,
  }) => {
    await request.post("/api/beneficiaries", {
      data: {
        name: "Arjun Bhattacharjee",
        relationship: "Son",
        email: "arjun@example.com",
        publicKeyPem: "-----BEGIN PUBLIC KEY-----\nDEMO\n-----END PUBLIC KEY-----",
      },
    });

    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await page
      .getByRole("link", { name: `Add a note under ${NOMINEE_NOTE.subcategoryLabel}` })
      .click();

    const chooser = page.getByLabel("Who should receive this?");
    await expect(chooser).toBeVisible();
    await chooser.selectOption({ label: "Arjun Bhattacharjee — Son" });

    await page.getByLabel("Title").fill("HDFC locker");
    await page.getByLabel("Add note").fill("Second key with Arjun.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/banks\.nominees\/note-/);

    await expect(page.getByText("Goes to Arjun Bhattacharjee")).toBeVisible();

    // Reopening must not silently reassign to the first Beneficiary.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const selected = await page.getByLabel("Who should receive this?").inputValue();
    const arjun = await page
      .getByLabel("Who should receive this?")
      .locator("option", { hasText: "Arjun" })
      .getAttribute("value");
    expect(selected).toBe(arjun);
  });
});
