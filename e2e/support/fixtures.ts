import { test as base } from "@playwright/test";
import { lazyOwnerApi, type OwnerApi } from "./app";

/**
 * `api`: the API, signed in as the spec's owner. It signs in on first use,
 * so a spec's beforeEach can reset the server and sign up first.
 */
export const test = base.extend<{ api: OwnerApi }>({
  api: async ({ baseURL }, provide) => {
    const api = lazyOwnerApi(baseURL!);
    await provide(api);
    await api.dispose();
  },
});

export { expect } from "@playwright/test";
