import { test, expect } from "@playwright/test";
import { gotoUnlocked, navigateViaMenu, resetServer, seedOnboarded, unlockIfNeeded } from "./support/app";

const DESTINATIONS = [
  { label: "My notes", url: /\/notes$/, heading: /Categories/ },
  { label: "Safety check-in", url: /\/heartbeat$/, heading: /Are you well\?/ },
  { label: "Trusted Friends", url: /\/trusted-friends$/, heading: /Trusted Friends/ },
  { label: "Beneficiary", url: /\/beneficiaries$/, heading: /Who receives your notes/ },
  { label: "Backup", url: /\/backup$/, heading: /Backup/ },
  { label: "Inherited notes", url: /\/inherited$/, heading: /Notes left to you/ },
  { label: "Settings", url: /\/settings$/, heading: /Settings/ },
  { label: "Help Centre", url: /\/help$/, heading: /Help Centre/ },
];

test.describe("Navigation", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  for (const dest of DESTINATIONS) {
    test(`the drawer reaches ${dest.label}`, async ({ page }) => {
      await gotoUnlocked(page, "/notes");
      await navigateViaMenu(page, dest.label, dest.url);
      await unlockIfNeeded(page);
      await expect(page.getByText(dest.heading).first()).toBeVisible();
    });
  }

  test("the home route sends you to My notes", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/notes$/);
  });

  test("an address that does not exist gets a reassuring page, not a bare 404", async ({
    page,
  }) => {
    await gotoUnlocked(page, "/notes");
    await page.goto("/this-route-does-not-exist");

    await expect(page.getByText(/That page does not exist/i)).toBeVisible();
    // The first fear this product raises is "have I lost everything?", so the
    // page has to answer it, and has to offer a way back.
    await expect(page.getByText(/notes are untouched/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to the home screen/i })).toBeVisible();
  });

  test("no screen renders the old dark theme inside the light shell", async ({ page }) => {
    // The overhaul left several pages behind once; this stops it recurring.
    const routes = [
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
    ];

    for (const route of routes) {
      await gotoUnlocked(page, route);

      // Park the cursor off every control first. Unlocking leaves the pointer
      // where it clicked, and a hovered primary button renders at
      // --action-hover (luminance 68.8) which is dark enough to look like a
      // legacy surface. This made the check flaky rather than wrong.
      await page.mouse.move(0, 0);

      const darkArea = await page.evaluate(() => {
        const isDark = (colour: string) => {
          const m = colour?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
          if (!m) return false;
          const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
          if (alpha < 0.5) return false;
          const [r, g, b] = [+m[1], +m[2], +m[3]];
          // 45 sits in the gap between the two populations: the legacy dark
          // surfaces this guards against are all under 25, and the darkest
          // thing the brand legitimately paints is --action-hover at 68.8.
          // Do not raise this towards 70 — that is what made it flaky.
          return 0.299 * r + 0.587 * g + 0.114 * b < 45;
        };
        let area = 0;
        for (const el of Array.from(document.querySelectorAll("main *"))) {
          if (isDark(getComputedStyle(el).backgroundColor)) {
            const r = el.getBoundingClientRect();
            area += Math.max(0, r.width) * Math.max(0, r.height);
          }
        }
        return Math.round(area);
      });

      expect(darkArea, `${route} has dark surfaces inside the light shell`).toBeLessThan(5000);
    }
  });
});
