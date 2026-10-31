import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import path from "path";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { categoryHref, inviteAcceptPath, newNoteHref, noteHref } from "../../lib/routes";
import { NATIVE_RELOAD_TO_ROOT } from "../../lib/native/reloadToRoot";
import { CATEGORY_TREE } from "../../lib/taxonomy/tree";
import { LOCALE_PACKS, resolveTaxonomy } from "../../lib/taxonomy";
import type { CountryCode } from "../../lib/taxonomy/types";

const ROOT = path.resolve(__dirname, "..", "..");

let response: Response | null = null;
let link = "";
let apiBase = "";
let replaced: string[] = [];
let buildError: Error | null = null;

/** Loads a module fresh, with these environment variables, as a build would. */
function loadWith<T>(file: string, env: Record<string, string | undefined>): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const id = require.resolve(path.join(ROOT, file));
  delete require.cache[id];
  try {
    // A fresh load is the point: these modules read the environment as they load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id) as T;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function req(pathname: string, origin?: string, method = "GET"): NextRequest {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new NextRequest(new URL(pathname, "https://api.virasat.example"), { method, headers });
}

/** Every subcategory id in every locale pack. */
function allSubcategoryIds(): string[] {
  const ids = new Set<string>();
  for (const g of CATEGORY_TREE) for (const s of g.subcategories) ids.add(s.id);
  for (const country of Object.keys(LOCALE_PACKS) as CountryCode[]) {
    for (const g of resolveTaxonomy(country)) for (const s of g.subcategories) ids.add(s.id);
  }
  return [...ids];
}

Given("the API host is configured to allow {string}", function (origin: string) {
  process.env.CORS_ALLOWED_ORIGINS = origin;
});

Given("the API host is running on its own", function () {
  process.env.VIRASAT_API_ONLY = "1";
});

When("a request to {string} arrives from {string}", function (pathname: string, origin: string) {
  // The browser asks first (the preflight); the answer decides the rest.
  response = proxy(req(pathname, origin, "OPTIONS"));
  delete process.env.CORS_ALLOWED_ORIGINS;
});

Then("it is allowed for {string}", function (origin: string) {
  assert.strictEqual(response!.status, 204);
  assert.strictEqual(response!.headers.get("access-control-allow-origin"), origin);
  assert.match(response!.headers.get("access-control-allow-headers") ?? "", /Authorization/);
});

Then("it is refused", function () {
  assert.strictEqual(response!.status, 403);
  assert.strictEqual(response!.headers.get("access-control-allow-origin"), null);
});

Then("the answer says it depends on the origin", function () {
  assert.strictEqual(response!.headers.get("vary"), "Origin");
});

Then("no cookie or credential is allowed across origins", function () {
  assert.strictEqual(response!.headers.get("access-control-allow-credentials"), null);
});

When("a browser opens {string} on the API host", function (pathname: string) {
  response = proxy(req(pathname));
  delete process.env.VIRASAT_API_ONLY;
});

Then("the API host answers 404", function () {
  assert.strictEqual(response!.status, 404);
});

Then("the page is served", function () {
  assert.strictEqual(response!.headers.get("x-middleware-next"), "1", `got ${response!.status}`);
});

Given("the app's API host is {string}", function (base: string) {
  apiBase = base;
});

When("the app builds the link for invitation {string}", function (token: string) {
  const config = loadWith<typeof import("../../lib/config")>("lib/config.ts", { NEXT_PUBLIC_API_BASE: apiBase });
  // Inside the app, the page's own origin is meaningless to anyone else.
  (globalThis as { window?: unknown }).window = { location: { origin: "capacitor://localhost" } };
  try {
    link = config.publicWebUrl(inviteAcceptPath(token));
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

Then("the link is {string}", function (expected: string) {
  assert.strictEqual(link, expected);
});

Then("the address of every kind of screen has no dot in its path", function () {
  const ids = allSubcategoryIds();
  assert.ok(ids.some((id) => id.includes(".")), "the premise: subcategory ids have dots");
  for (const id of ids) {
    for (const href of [categoryHref(id), newNoteHref(id), noteHref(id, "note-1.2"), inviteAcceptPath("t.k")]) {
      const last = new URL(href, "capacitor://localhost").pathname.split("/").pop()!;
      assert.ok(!last.includes("."), `${href} would be read as a file`);
    }
  }
});

Then("every subcategory and note id comes back unchanged from its address", function () {
  for (const id of allSubcategoryIds()) {
    assert.strictEqual(new URL(categoryHref(id), "capacitor://localhost").searchParams.get("sub"), id);
    const note = new URL(noteHref(id, "note-1&x"), "capacitor://localhost").searchParams;
    assert.strictEqual(note.get("sub"), id);
    assert.strictEqual(note.get("id"), "note-1&x");
  }
});

When(/^the shell (?:re)?loads "([^"]+)" in the native build$/, function (pathname: string) {
  replaced = [];
  new Function("location", NATIVE_RELOAD_TO_ROOT)({ pathname, replace: (to: string) => replaced.push(to) });
});

Then("the app goes to {string} before it starts", function (to: string) {
  assert.deepStrictEqual(replaced, [to]);
});

Then("the app stays where it is", function () {
  assert.deepStrictEqual(replaced, []);
});

When("the native app is built without an API host", function () {
  buildError = null;
  try {
    loadWith("next.config.ts", { BUILD_TARGET: "app", NEXT_PUBLIC_NATIVE: "1", NEXT_PUBLIC_API_BASE: undefined });
  } catch (err) {
    buildError = err as Error;
  }
});

Then("the build stops and says it needs one", function () {
  assert.ok(buildError, "the build went ahead");
  assert.match(buildError!.message, /needs NEXT_PUBLIC_API_BASE/);
});
