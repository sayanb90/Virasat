import { defineConfig, devices } from "@playwright/test";

/**
 * Two topologies, one suite.
 *
 *   combined (default)  One Next process serves the app and /api, as in
 *                       development.
 *   split               E2E_MODE=split. The app is the static export in
 *                       out/, served on its own origin, talking to the API on
 *                       another — what the native app actually does. Build
 *                       both first with `npm run build:e2e-split`.
 */
const SPLIT = process.env.E2E_MODE === "split";
const PORT = Number(process.env.E2E_PORT ?? 3399);
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3398);
const API_ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE_URL = SPLIT ? `http://127.0.0.1:${APP_PORT}` : API_ORIGIN;

// Read by e2e/support so API calls go to the API origin, not the page's.
process.env.E2E_API_ORIGIN = API_ORIGIN;

const apiServerEnv = {
  // Unlocks /api/test/reset and /api/scheduler for this run only.
  VIRASAT_E2E: "1",
  // Email: the console driver sends nothing, so nothing leaves the
  // machine. The ladder goes to the signed-in account, which the specs
  // create as owner@virasat.test (e2e/support/app.ts).
  EMAIL_DRIVER: "console",
  EMAIL_FROM: "Virasat <hello@virasat.test>",
  // Emailed links open in a browser, so they point at the web host — which
  // in the split topology is the API host.
  APP_URL: API_ORIGIN,
  // The test sheet for Apple / Google / Facebook.
  AUTH_PROVIDERS_DRIVER: "stub",
  // The static app's origin, so its cross-origin calls are allowed. Never
  // set in production: there, only the native origins are.
  ...(SPLIT ? { CORS_ALLOWED_ORIGINS: BASE_URL } : {}),
};

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

  webServer: SPLIT
    ? [
        {
          command: `node scripts/serve-static.mjs out ${APP_PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: `npm run start -- --port ${PORT}`,
          // The API host 404s its root by design; an unauthenticated API
          // route answers 401, which Playwright accepts as "up".
          url: `${API_ORIGIN}/api/auth/session`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: apiServerEnv,
        },
      ]
    : {
        command: `npm run start -- --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: apiServerEnv,
      },
});
