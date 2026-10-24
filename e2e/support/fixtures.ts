import { test as base } from "@playwright/test";
import { API_ORIGIN, lazyOwnerApi, type OwnerApi } from "./app";

/**
 * `request`: talks to the API origin rather than the page's. In the split
 *   topology the page is the static export on one origin and /api is on
 *   another; in the combined one they are the same, so nothing changes.
 *
 * `api`: the API, signed in as the spec's owner. It signs in on first use,
 *   so a spec's beforeEach can reset the server and sign up first.
 */
export const test = base.extend<{ api: OwnerApi }>({
  request: async ({ playwright }, provide) => {
    const ctx = await playwright.request.newContext({ baseURL: API_ORIGIN });
    await provide(ctx);
    await ctx.dispose();
  },
  api: async ({}, provide) => {
    const api = lazyOwnerApi(API_ORIGIN);
    await provide(api);
    await api.dispose();
  },
});

export { expect } from "@playwright/test";
