import { test, expect, type Page } from "@playwright/test";
import { resetServer, seedOnboarded, unlockIfNeeded } from "./support/app";

/**
 * A button whose label spills onto a second line looks unfinished, and it is
 * the kind of thing that creeps back every time copy changes or a font
 * renders a little wider. "Unlock with Touch ID or Face ID" overflowed its
 * button by a few pixels and wrapped; this stops that recurring.
 *
 * Only elements the Button component renders are checked — they carry
 * data-ui="button". Full-width navigation rows legitimately run to two lines
 * when a name is long, and are not buttons.
 */
const ROUTES = [
  "/notes",
  "/heartbeat",
  "/trusted-friends",
  "/beneficiaries",
  "/backup",
  "/inherited",
  "/settings",
  "/audit",
  "/claim",
  "/help",
  "/notes/banks.nominees",
  "/notes/banks.nominees/new",
];

/**
 * Returns any button label occupying more than one line box.
 *
 * Counts line boxes of a *single* text node. Measuring the element instead
 * would count an icon as a second line, because its top differs from the
 * label's.
 */
async function wrappedButtonLabels(page: Page): Promise<Array<{ label: string; lines: number }>> {
  return page.evaluate(() => {
    const out: Array<{ label: string; lines: number }> = [];
    for (const el of Array.from(document.querySelectorAll('[data-ui="button"]'))) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = (node.textContent ?? "").trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops = new Set(
          Array.from(range.getClientRects())
            .filter((r) => r.height > 1 && r.width > 1)
            // Quantise: sub-pixel differences on one line are not two lines.
            .map((r) => Math.round(r.top / 4))
        );
        if (tops.size > 1) out.push({ label: text.slice(0, 60), lines: tops.size });
      }
    }
    return out;
  });
}

test.describe("Button labels fit on one line at 390px", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("the unlock screen's buttons do not wrap", async ({ page }) => {
    // The locked state is a screen too. An earlier sweep clicked past it and
    // so missed the one button that was actually broken.
    await page.goto("/notes");
    await expect(page.getByRole("button", { name: /Touch ID/i })).toBeVisible();

    const wrapped = await wrappedButtonLabels(page);
    expect(wrapped, `wrapped on the unlock screen: ${JSON.stringify(wrapped)}`).toEqual([]);
  });

  for (const route of ROUTES) {
    test(`no button wraps on ${route}`, async ({ page }) => {
      await page.goto(route);
      await unlockIfNeeded(page);
      await page.waitForLoadState("networkidle");

      const wrapped = await wrappedButtonLabels(page);
      expect(wrapped, `wrapped on ${route}: ${JSON.stringify(wrapped)}`).toEqual([]);
    });
  }
});
