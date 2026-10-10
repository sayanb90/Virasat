import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEMO_PASSPHRASE = "VirasatMaster2026!#";

/**
 * Clears the shared in-memory store. Specs share one server process, so
 * without this a note or invitation from one spec shows up in the next.
 */
export async function resetServer(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/test/reset");
  expect(res.ok(), "test reset route should be reachable (VIRASAT_E2E=1)").toBeTruthy();
}

/**
 * Skips the welcome flow.
 *
 * Only the "already onboarded" direction is seeded: a fresh browser context
 * starts with empty localStorage, which is exactly an unonboarded visitor.
 * Seeding the false case with addInitScript would re-clear the flag on every
 * navigation, so completing the flow could never stick.
 */
export async function seedOnboarded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("virasat.onboarded", "true");
    } catch {
      /* storage blocked */
    }
  });
}

/**
 * The master key lives in tab memory only, so every full page load lands on
 * the unlock screen. Call this after any goto into a vault screen.
 */
export async function unlockIfNeeded(page: Page): Promise<void> {
  const unlock = page.getByRole("button", { name: /Open my notes/i });
  if (await unlock.isVisible().catch(() => false)) {
    await unlock.click();
    await expect(unlock).toBeHidden({ timeout: 15_000 });
  }
}

export async function gotoUnlocked(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await unlockIfNeeded(page);
}

/**
 * Opens the drawer and follows a destination, keeping the vault session.
 *
 * The drawer stays mounted and slides off-screen rather than unmounting, so
 * waiting for the dialog to disappear would hang. The URL is the signal.
 */
export async function navigateViaMenu(
  page: Page,
  destination: string,
  expectUrl?: RegExp
): Promise<void> {
  await page.getByRole("button", { name: "Open menu" }).click();
  const link = page.getByRole("link", { name: destination, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  if (expectUrl) await page.waitForURL(expectUrl);
}

export interface NewNote {
  /** Subcategory id, e.g. "banks.nominees". */
  subcategoryId: string;
  /** Human label as the category tree renders it. */
  subcategoryLabel: string;
  /** Group heading to expand, e.g. /BANKS AND FINANCIAL/. */
  groupPattern: RegExp;
  title: string;
  body: string;
}

/** Creates a note the way a person would: tree -> plus -> form -> save. */
export async function createNote(page: Page, note: NewNote): Promise<string> {
  await gotoUnlocked(page, "/notes");
  await page.getByRole("button", { name: note.groupPattern }).click();
  await page
    .getByRole("link", { name: `Add a note under ${note.subcategoryLabel}` })
    .click();
  await page.waitForURL(new RegExp(`${escapeRe(note.subcategoryId)}/new`));

  await page.getByLabel("Title").fill(note.title);
  await page.getByLabel("Add note").fill(note.body);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.waitForURL(new RegExp(`${escapeRe(note.subcategoryId)}/note-`));
  return page.url().split("/").pop() as string;
}

export function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convenience: a nominee note, used by several specs. */
export const NOMINEE_NOTE: NewNote = {
  subcategoryId: "banks.nominees",
  subcategoryLabel: "Nominee Details",
  groupPattern: /banks and financial/i,
  title: "SBI nomination",
  body: "Nominee is Meera. Signed form DA-1 kept in the almirah.",
};
