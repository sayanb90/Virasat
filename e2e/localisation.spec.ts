import { test, expect } from "./support/fixtures";
import { NOMINEE_NOTE, createNote, gotoUnlocked, resetServer, signUp, unlockIfNeeded } from "./support/app";

async function chooseCountry(page: import("@playwright/test").Page, name: string) {
  await gotoUnlocked(page, "/settings");
  await page.getByRole("button", { name: /^Country/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
}

test.describe("Country and vocabulary", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await signUp(page);
  });

  test("India and International label the same category differently", async ({ page }) => {
    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await expect(
      page.getByRole("link", { name: "Provident Funds & Pensions", exact: true })
    ).toBeVisible();
    await expect(page.getByText(/EPF \(and your UAN\), PPF, NPS/)).toBeVisible();

    await chooseCountry(page, "International");

    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await expect(
      page.getByRole("link", { name: "Pensions & Retirement", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Provident Funds & Pensions", exact: true })
    ).toBeHidden();
  });

  test("India-only categories disappear under International", async ({ page }) => {
    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await expect(page.getByRole("link", { name: "Nominee Details", exact: true })).toBeVisible();

    await chooseCountry(page, "International");

    await gotoUnlocked(page, "/notes");
    await page.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await expect(page.getByRole("link", { name: "Nominee Details", exact: true })).toBeHidden();
  });

  test("switching country never orphans a note filed under a market-specific category", async ({
    page,
  }) => {
    // The whole point of persisting ids rather than labels. A note filed under
    // the India-only banks.nominees must still describe itself after the
    // switch, not read as "Uncategorised".
    const noteId = await createNote(page, NOMINEE_NOTE);

    await chooseCountry(page, "International");

    await gotoUnlocked(page, `/notes/${NOMINEE_NOTE.subcategoryId}/${noteId}`);
    await expect(page.getByRole("heading", { name: NOMINEE_NOTE.title })).toBeVisible();
    await expect(page.getByText(/Nominee is Meera/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Uncategorised");
  });

  test("the choice survives a reload", async ({ page }) => {
    await chooseCountry(page, "International");

    await page.reload();
    await unlockIfNeeded(page);
    await page.getByRole("button", { name: /^Country/ }).click();
    await expect(page.getByRole("button", { name: "International", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
