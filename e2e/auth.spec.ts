import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import {
  NOMINEE_NOTE,
  OWNER,
  createNote,
  gotoUnlocked,
  lastCode,
  navigateViaMenu,
  resetServer,
  signUp,
  signUpViaApi,
} from "./support/app";
import { loginProof } from "../lib/crypto/account";
import { PUBLIC_ROUTES } from "../lib/auth/http";

/** A different phone: its own browser context, so nothing on it from sign-up. */
async function newPhone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return ctx.newPage();
}

async function signInWithPassword(page: Page, password = OWNER.password): Promise<void> {
  await page.goto("/welcome/sign-in?existing=1");
  await page.getByLabel("Email address").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/* ------------------------------------------------------------------------ */

test.describe("Every route needs a session", () => {
  test("no route outside the public allow-list answers without one", async ({ request }) => {
    // Walks the route tree rather than a list, so a new route cannot quietly
    // ship open: it fails here until it calls requireSession or is listed.
    const root = join(__dirname, "..", "app", "api");
    const routes: Array<{ path: string; methods: string[] }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") {
          const src = readFileSync(full, "utf8");
          const methods = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
          routes.push({ path: relative(root, dir).split("\\").join("/"), methods });
        }
      }
    };
    walk(root);
    expect(routes.length).toBeGreaterThan(30);

    const open: string[] = [];
    for (const route of routes) {
      if (route.path in PUBLIC_ROUTES) continue;
      for (const method of route.methods) {
        const res = await request.fetch(`/api/${route.path}`, { method, data: method === "GET" ? undefined : {} });
        if (res.status() !== 401) open.push(`${method} /api/${route.path} → ${res.status()}`);
      }
    }
    expect(open, "these routes answered without a session").toEqual([]);
  });

  test("a password alone, without tier two, cannot reach the notes", async ({ request }) => {
    await resetServer(request);
    await signUpViaApi(request);
    const kdf = await (await request.post("/api/auth/prelogin", { data: { email: OWNER.email } })).json();
    const { authKeyHex } = await loginProof(OWNER.password, kdf);
    const login = await (await request.post("/api/auth/login", { data: { email: OWNER.email, authKeyHex } })).json();
    expect(login.stage).toBe("pending");

    const res = await request.get("/api/vault", { headers: { Authorization: `Bearer ${login.accessToken}` } });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("locked");
  });
});

test.describe("Signing in", () => {
  test.beforeEach(async ({ request }) => {
    await resetServer(request);
  });

  test("a new phone needs the password and a code from the email", async ({ page, browser, api }) => {
    await signUp(page);
    await createNote(page, NOMINEE_NOTE);

    const phone = await newPhone(browser);
    await signInWithPassword(phone);
    await expect(phone.getByRole("heading", { name: "This is a new phone" })).toBeVisible();
    await phone.getByLabel("The code from the email").fill(await lastCode(phone.request, OWNER.email));
    await phone.getByRole("button", { name: "Confirm" }).click();

    await phone.getByLabel("Choose a PIN of six numbers").fill("615283");
    await phone.getByLabel("Type the PIN again").fill("615283");
    await phone.getByRole("button", { name: "Lock with this PIN" }).click();
    await phone.waitForURL(/\/notes$/);

    // The same vault, opened on the new phone with nothing but the password.
    await phone.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await phone.getByRole("link", { name: NOMINEE_NOTE.subcategoryLabel, exact: true }).click();
    await phone.getByRole("link", { name: new RegExp(NOMINEE_NOTE.title) }).click();
    await expect(phone.getByText(/Nominee is Meera/)).toBeVisible();

    const { outbox } = await (await api.get("/api/email")).json();
    expect(outbox.some((e: { subject: string }) => e.subject === "A new phone signed in to Virasat")).toBe(true);
    await phone.context().close();
  });

  test("a phone already set up signs in with the password, then Face ID", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.getByRole("button", { name: /^Signing in/ }).click();
    await page.getByRole("button", { name: "Sign out of this phone" }).click();
    await page.waitForURL(/\/welcome/);

    await signInWithPassword(page);
    await expect(page.getByRole("heading", { name: "Confirm it is you" })).toBeVisible();
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.waitForURL(/\/notes$/);
  });

  test("a wrong password is refused", async ({ page, browser }) => {
    await signUp(page);
    const phone = await newPhone(browser);
    await signInWithPassword(phone, "not-the-right-password");
    await expect(phone.getByText(/That email and password do not match/)).toBeVisible();
    await phone.context().close();
  });

  test("Face ID can be turned on later from Settings", async ({ page }) => {
    // Also the way back after a new face or fingerprint switches it off on
    // a phone: the app says to turn it on again in Settings.
    await signUp(page, OWNER, { faceId: false });
    await page.reload();
    await expect(page.getByLabel("Your PIN")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use Face ID" })).toHaveCount(0);
    await page.getByLabel("Your PIN").fill(OWNER.pin);
    await page.getByRole("button", { name: "Open with PIN" }).click();

    await navigateViaMenu(page, "Settings", /\/settings$/);
    await page.getByRole("button", { name: /Signing in/ }).click();
    await expect(page.getByText("This phone opens with your PIN.")).toBeVisible();
    await page.getByRole("button", { name: "Turn on Face ID" }).click();
    await page.getByLabel("Choose a PIN of six numbers").fill(OWNER.pin);
    await page.getByLabel("Type the PIN again").fill(OWNER.pin);
    await page.getByRole("button", { name: "Lock with this PIN" }).click();
    await expect(page.getByText("This phone opens with Face ID or your PIN.")).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await expect(page.getByRole("button", { name: "Use Face ID" })).toBeHidden({ timeout: 15_000 });
  });

  test("the PIN opens the app, and five wrong PINs lock it", async ({ page }) => {
    await signUp(page);
    await page.goto("/notes");
    await page.getByLabel("Your PIN").fill(OWNER.pin);
    await page.getByRole("button", { name: "Open with PIN" }).click();
    await expect(page.getByText("Insurance & Cover")).toBeVisible();

    await page.goto("/notes");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Your PIN").fill("000000");
      await page.getByRole("button", { name: "Open with PIN" }).click();
      await expect(page.getByText(/That PIN is not right|PIN is locked/)).toBeVisible();
      if (i < 4) await page.goto("/notes");
    }
    await expect(page.getByText(/PIN is locked/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in with my password" })).toBeVisible();
  });
});

test.describe("Signing up with a provider", () => {
  test.beforeEach(async ({ request }) => {
    await resetServer(request);
  });

  test("Google gives the name and email; Virasat still asks for a password", async ({ page }) => {
    await page.goto("/welcome/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const sheet = page.getByRole("dialog", { name: "Test Google sign-in" });
    await sheet.getByLabel("Name").fill("Anil Rao");
    await sheet.getByLabel(/Email on the Google account/).fill("anil@virasat.test");
    await sheet.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveValue("Anil Rao");
    await page.getByLabel("Password", { exact: true }).fill("Banyan-Leaf-Kite-7");
    await page.getByLabel("Type the password again").fill("Banyan-Leaf-Kite-7");
    await page.getByRole("button", { name: "Create my account" }).click();

    await page.getByLabel("Choose a PIN of six numbers").fill("615283");
    await page.getByLabel("Type the PIN again").fill("615283");
    await page.getByRole("button", { name: "Lock with this PIN" }).click();
    await page.getByRole("checkbox", { name: /I have printed it/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(/\/notes$/);

    // Next time, on this phone: Google, then Face ID.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.getByRole("button", { name: /^Signing in/ }).click();
    await page.getByRole("button", { name: "Sign out of this phone" }).click();
    await page.waitForURL(/\/welcome/);
    await page.goto("/welcome/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.getByLabel("Name").fill("Anil Rao");
    await page.getByLabel(/Email on the Google account/).fill("anil@virasat.test");
    await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Confirm it is you" })).toBeVisible();
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.waitForURL(/\/notes$/);
  });
});

test.describe("Forgotten password", () => {
  test.beforeEach(async ({ request }) => {
    await resetServer(request);
  });

  test("on the phone already set up: Face ID, a code, a new password", async ({ page, browser }) => {
    await signUp(page);
    await createNote(page, NOMINEE_NOTE);

    await page.goto("/notes");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.getByRole("button", { name: /I still have this phone/ }).click();
    await page.getByRole("button", { name: "Send me a code" }).click();
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.getByLabel("The code from the email").fill(await lastCode(page.request, OWNER.email));
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByLabel("New password").fill("Peacock-Feather-Blue-9");
    await page.getByLabel("Type it again").fill("Peacock-Feather-Blue-9");
    await page.getByRole("button", { name: "Save my new password" }).click();
    await page.waitForURL(/\/notes$/);

    // The new password works on another phone, and opens the same notes.
    const phone = await newPhone(browser);
    await signInWithPassword(phone, "Peacock-Feather-Blue-9");
    await expect(phone.getByRole("heading", { name: "This is a new phone" })).toBeVisible();
    await phone.context().close();
  });

  test("with the Recovery Kit: a 72-hour wait, then the same notes", async ({ page, browser, request }) => {
    const { recoveryCode } = await signUp(page);
    await createNote(page, NOMINEE_NOTE);

    const phone = await newPhone(browser);
    await phone.goto("/welcome/recover");
    await phone.getByRole("button", { name: /Use my Recovery Kit/ }).click();
    await phone.getByLabel("Email address").fill(OWNER.email);
    await phone.getByRole("button", { name: "Send me a code" }).click();
    await phone.getByLabel("The code from the email").fill(await lastCode(phone.request, OWNER.email));
    await phone.getByRole("button", { name: "Confirm" }).click();
    await phone.getByLabel("Recovery code").fill(recoveryCode.toLowerCase());
    await phone.getByRole("button", { name: "Continue" }).click();
    await expect(phone.getByRole("heading", { name: "Please come back in 72 hours" })).toBeVisible();

    // Too early: still waiting after a reload.
    await phone.goto("/welcome/recover");
    await expect(phone.getByRole("heading", { name: "Please come back in 72 hours" })).toBeVisible();

    await request.post("/api/test/clock", { data: { advanceMs: 72 * 3_600_000 } });
    await phone.goto("/welcome/recover");
    await phone.getByLabel("Recovery code").fill(recoveryCode);
    await phone.getByLabel("New password").fill("Peacock-Feather-Blue-9");
    await phone.getByLabel("Type it again").fill("Peacock-Feather-Blue-9");
    await phone.getByRole("button", { name: "Save my new password" }).click();

    // A new kit replaces the spent one.
    await expect(phone.getByTestId("recovery-code")).toBeVisible();
    expect((await phone.getByTestId("recovery-code").innerText()).trim()).not.toBe(recoveryCode);
    await phone.getByRole("checkbox", { name: /I have printed it/ }).check();
    await phone.getByRole("button", { name: "Continue", exact: true }).click();
    await phone.getByLabel("Choose a PIN of six numbers").fill("615283");
    await phone.getByLabel("Type the PIN again").fill("615283");
    await phone.getByRole("button", { name: "Lock with this PIN" }).click();
    await phone.waitForURL(/\/notes$/);

    await phone.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await phone.getByRole("link", { name: NOMINEE_NOTE.subcategoryLabel, exact: true }).click();
    await phone.getByRole("link", { name: new RegExp(NOMINEE_NOTE.title) }).click();
    await expect(phone.getByText(/Nominee is Meera/)).toBeVisible();
    await phone.context().close();
  });

  test("the Owner can stop a Recovery Kit recovery from the email", async ({ page, browser, request }) => {
    const { recoveryCode } = await signUp(page);

    const phone = await newPhone(browser);
    await phone.goto("/welcome/recover");
    await phone.getByRole("button", { name: /Use my Recovery Kit/ }).click();
    await phone.getByLabel("Email address").fill(OWNER.email);
    await phone.getByRole("button", { name: "Send me a code" }).click();
    await phone.getByLabel("The code from the email").fill(await lastCode(phone.request, OWNER.email));
    await phone.getByRole("button", { name: "Confirm" }).click();
    await phone.getByLabel("Recovery code").fill(recoveryCode);
    await phone.getByRole("button", { name: "Continue" }).click();
    await expect(phone.getByRole("heading", { name: "Please come back in 72 hours" })).toBeVisible();

    // The Owner, on their own phone, taps the button in the email.
    const { cancelToken } = await (await request.get(`/api/test/codes?email=${OWNER.email}`)).json();
    await page.goto(`/welcome/recover/cancel#${encodeURIComponent(cancelToken)}`);
    await expect(page.getByRole("heading", { name: "Stopped" })).toBeVisible();

    await request.post("/api/test/clock", { data: { advanceMs: 72 * 3_600_000 } });
    await phone.goto("/welcome/recover");
    await expect(phone.getByRole("heading", { name: "This recovery was stopped" })).toBeVisible();
    await phone.context().close();
  });
});

test.describe("Recovery Kit reminder", () => {
  test("postponing the kit leaves a reminder on My notes", async ({ page, request }) => {
    await resetServer(request);
    await page.goto("/welcome/sign-in");
    await page.getByRole("button", { name: "I am new to Virasat" }).click();
    await page.getByLabel("Email address").fill(OWNER.email);
    await page.getByRole("button", { name: "Send me a code" }).click();
    await page.getByLabel("The code from the email").fill(await lastCode(page.request, OWNER.email));
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByLabel("Your name").fill(OWNER.name);
    await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
    await page.getByLabel("Type the password again").fill(OWNER.password);
    await page.getByRole("button", { name: "Create my account" }).click();
    await page.getByLabel("Choose a PIN of six numbers").fill(OWNER.pin);
    await page.getByLabel("Type the PIN again").fill(OWNER.pin);
    await page.getByRole("button", { name: "Lock with this PIN" }).click();
    await page.getByRole("button", { name: "Remind me later" }).click();
    await page.waitForURL(/\/notes$/);
    await expect(page.getByText("Save your Recovery Kit.")).toBeVisible();

    await gotoUnlocked(page, "/settings");
    await page.getByRole("button", { name: /^Signing in/ }).click();
    await page.getByRole("button", { name: "Make a new Recovery Kit" }).click();
    await page.getByRole("checkbox", { name: /I have printed it/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await gotoUnlocked(page, "/notes");
    await expect(page.getByText("Save your Recovery Kit.")).toBeHidden();
  });
});
