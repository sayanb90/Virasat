import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3399);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end configuration.
 *
 * The app under test is a single Next process with an in-memory store, so
 * specs share server state. Each spec resets it through the gated
 * /api/test/reset route in a beforeEach, and workers are limited to one so
 * two specs can never reset each other mid-run.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The product is phone-first; desktop breakpoints are not where the risk is.
    ...devices["Pixel 7"],
    isMobile: false, // keep normal mouse events; viewport is what matters here
    hasTouch: false,
    viewport: { width: 390, height: 844 },
  },

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Unlocks /api/test/reset and /api/scheduler for this run only.
      VIRASAT_E2E: "1",
      // Email: the console driver sends nothing, so nothing leaves the
      // machine. An owner address is set so the escalation ladder actually
      // has somewhere to go — without it the idempotency specs would pass
      // vacuously, having proved only that zero sends stay zero.
      EMAIL_DRIVER: "console",
      EMAIL_FROM: "Virasat <hello@virasat.test>",
      APP_URL: BASE_URL,
      OWNER_NAME: "Test Owner",
      OWNER_EMAIL: "owner@virasat.test",
    },
  },
});
