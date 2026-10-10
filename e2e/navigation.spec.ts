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

      const darkArea = await page.evaluate(() => {
        const isDark = (colour: string) => {
          const m = colour?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
          if (!m) return false;
          const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
          if (alpha < 0.5) return false;
          const [r, g, b] = [+m[1], +m[2], +m[3]];
          // Below the brand's own action colour, so buttons do not trip it.
          return 0.299 * r + 0.587 * g + 0.114 * b < 70;
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
