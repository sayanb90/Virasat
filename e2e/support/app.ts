import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import { buildNewAccount, buildRecoveryKit, loginProof } from "../../lib/crypto/account";
import { newNoteHref } from "../../lib/routes";

/**
 * Where /api lives. In the split topology that is not the page's origin, so
 * helpers use absolute URLs and work with any request context — including
 * `page.request`, which is bound to the page's origin.
 */
export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "";

/**
 * Where a note opens once saved: /notes/view?sub=…&id=note-…
 *
 * The app is a static export, so the note id travels in the query string
 * rather than the path. Specs wait on this instead of spelling the URL.
 */
export function savedNoteUrl(subcategoryId: string): RegExp {
  return new RegExp(`/notes/view\\?sub=${escapeRe(subcategoryId)}&id=note-`);
}

/** The account most specs act as. The ladder specs expect mail to this address. */
export const OWNER = {
  name: "Test Owner",
  email: "owner@virasat.test",
  password: "Mango-Tree-Rain-42",
  pin: "482915",
};

export type Owner = typeof OWNER;

/**
 * Clears the shared in-memory store, accounts included. Specs share one
 * server process, so without this a note or invitation from one spec shows
 * up in the next.
 */
export async function resetServer(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API_ORIGIN}/api/test/reset`);
  expect(res.ok(), "test reset route should be reachable (VIRASAT_E2E=1)").toBeTruthy();
}

/** The last code emailed to an address. Tests cannot read an inbox. */
export async function lastCode(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.get(`${API_ORIGIN}/api/test/codes?email=${encodeURIComponent(email)}`);
  const { code } = await res.json();
  expect(code, `a code should have been emailed to ${email}`).toBeTruthy();
  return code as string;
}

/**
 * Signs up through the real screens: welcome, email, code, password, Face ID
 * and PIN, Recovery Kit. Ends unlocked on My notes, with this browser
 * context enrolled as the account's phone.
 */
export async function signUp(
  page: Page,
  owner: Owner = OWNER,
  options: { faceId?: boolean } = {}
): Promise<{ recoveryCode: string }> {
  await page.goto("/welcome");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/welcome\/sign-in/);

  await page.getByRole("button", { name: "I am new to Virasat" }).click();
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("The code from the email").fill(await lastCode(page.request, owner.email));
  await page.getByRole("button", { name: "Confirm" }).click();

  await page.getByLabel("Your name").fill(owner.name);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByLabel("Type the password again").fill(owner.password);
  await page.getByRole("button", { name: "Create my account" }).click();

  if (options.faceId === false) await page.getByRole("checkbox", { name: /Use Face ID/ }).uncheck();
  await page.getByLabel("Choose a PIN of six numbers").fill(owner.pin);
  await page.getByLabel("Type the PIN again").fill(owner.pin);
  await page.getByRole("button", { name: "Lock with this PIN" }).click();

  await expect(page.getByTestId("recovery-code")).toBeVisible({ timeout: 15_000 });
  const recoveryCode = (await page.getByTestId("recovery-code").innerText()).trim();
  await page.getByRole("checkbox", { name: /I have printed it/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/notes$/);
  return { recoveryCode };
}

/**
 * Signs up without a browser, for specs that only use the API. The account
 * has no enrolled phone; the session it gets is full, as after sign-up.
 */
export async function signUpViaApi(request: APIRequestContext, owner: Owner = OWNER): Promise<void> {
  await request.post("/api/auth/signup/start", { data: { email: owner.email } });
  const verified = await (
    await request.post("/api/auth/signup/verify", {
      data: { email: owner.email, code: await lastCode(request, owner.email) },
    })
  ).json();
  const account = await buildNewAccount(owner.password);
  const kit = await buildRecoveryKit(account.vaultKeyBytes);
  const res = await request.post("/api/auth/signup/complete", {
    data: { signupTicket: verified.signupTicket, name: owner.name, ...account.send, recovery: kit.send },
  });
  expect(res.ok(), "sign-up through the API should succeed").toBeTruthy();
}

/**
 * Signs in as the owner from outside the browser, the way a second phone
 * would: password, then the code emailed for a new device. Returns a request
 * context that sends the resulting token with every call.
 */
export async function signInApi(baseURL: string, owner: Owner = OWNER): Promise<APIRequestContext> {
  const anon = await playwrightRequest.newContext({ baseURL });
  try {
    const kdf = await (await anon.post("/api/auth/prelogin", { data: { email: owner.email } })).json();
    const { authKeyHex } = await loginProof(owner.password, kdf);
    const login = await (
      await anon.post("/api/auth/login", { data: { email: owner.email, authKeyHex } })
    ).json();
    expect(login.success, `signing in as ${owner.email} should succeed: ${login.error}`).toBe(true);
    const code = await lastCode(anon, owner.email);
    const full = await (
      await anon.post("/api/auth/code", {
        data: { code },
        headers: { Authorization: `Bearer ${login.accessToken}` },
      })
    ).json();
    expect(full.stage).toBe("full");
    return await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${full.accessToken}` },
    });
  } finally {
    await anon.dispose();
  }
}

/** A request context that signs in on first use, after the spec has signed up. */
export function lazyOwnerApi(baseURL: string, owner: Owner = OWNER) {
  let ctx: Promise<APIRequestContext> | null = null;
  const get = () => (ctx ??= signInApi(baseURL, owner));
  type Opts = Parameters<APIRequestContext["get"]>[1];
  return {
    get: async (url: string, opts?: Opts): Promise<APIResponse> => (await get()).get(url, opts),
    post: async (url: string, opts?: Opts): Promise<APIResponse> => (await get()).post(url, opts),
    patch: async (url: string, opts?: Opts): Promise<APIResponse> => (await get()).patch(url, opts),
    put: async (url: string, opts?: Opts): Promise<APIResponse> => (await get()).put(url, opts),
    delete: async (url: string, opts?: Opts): Promise<APIResponse> => (await get()).delete(url, opts),
    dispose: async () => {
      if (ctx) await (await ctx).dispose();
    },
  };
}

export type OwnerApi = ReturnType<typeof lazyOwnerApi>;

/**
 * Tier two after a full page load: the vault key lives in memory only, so
 * every reload lands on the unlock screen. The browser build's Face ID is a
 * stand-in, but the server still checks the biometric key's signature.
 */
export async function unlockIfNeeded(page: Page): Promise<void> {
  const faceId = page.getByRole("button", { name: "Use Face ID" });
  await faceId.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await faceId.isVisible().catch(() => false)) {
    await faceId.click();
    await expect(faceId).toBeHidden({ timeout: 15_000 });
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
  await page.waitForURL(new RegExp(escapeRe(newNoteHref(note.subcategoryId))));

  await page.getByLabel("Title").fill(note.title);
  await page.getByLabel("Add note").fill(note.body);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.waitForURL(savedNoteUrl(note.subcategoryId));
  // The id is in the query string, not the last path segment.
  const id = new URL(page.url()).searchParams.get("id");
  expect(id, `the saved note's URL should carry its id: ${page.url()}`).toBeTruthy();
  return id as string;
}

export function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The first group on the category list, as the DOM holds it (CSS uppercases
 * it on screen). Several specs use it to say "we are looking at the
 * categories", so a rename lands here rather than in three places.
 */
export const FIRST_GROUP_LABEL = "Insurance & Cover";

/** Convenience: a nominee note, used by several specs. */
export const NOMINEE_NOTE: NewNote = {
  subcategoryId: "banks.nominees",
  subcategoryLabel: "Nominee Details",
  groupPattern: /banking & accounts/i,
  title: "SBI nomination",
  body: "Nominee is Meera. Signed form DA-1 kept in the almirah.",
};
