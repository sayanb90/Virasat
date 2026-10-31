import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { categoryHref, inviteAcceptPath, newNoteHref, noteHref } from "@/lib/routes";

const ROOT = path.resolve(__dirname, "..", "..");

describe("app URLs (lib/routes.ts)", () => {
  test("every value travels in the query string, and every path is extensionless", () => {
    const hrefs = [
      categoryHref("banks.nominees"),
      newNoteHref("banks.nominees"),
      noteHref("banks.nominees", "note-1"),
      inviteAcceptPath("tok_abc"),
    ];
    for (const href of hrefs) {
      const { pathname } = new URL(href, "capacitor://localhost");
      const last = pathname.split("/").pop()!;
      assert.ok(!last.includes("."), `${href}: Capacitor would read "${last}" as a file`);
    }
    assert.equal(categoryHref("banks.nominees"), "/notes/category?sub=banks.nominees");
    assert.equal(newNoteHref("banks.nominees"), "/notes/new?sub=banks.nominees");
    assert.equal(noteHref("banks.nominees", "note-1"), "/notes/view?sub=banks.nominees&id=note-1");
    assert.equal(inviteAcceptPath("tok_abc"), "/trusted-friends/accept?token=tok_abc");
  });

  test("values that would break a URL are encoded and come back intact", () => {
    const odd = "a b&c=d/é?#";
    const url = new URL(noteHref(odd, odd), "https://x.test");
    assert.equal(url.searchParams.get("sub"), odd);
    assert.equal(url.searchParams.get("id"), odd);
    assert.equal(new URL(categoryHref(odd), "https://x.test").searchParams.get("sub"), odd);
    assert.equal(new URL(newNoteHref(odd), "https://x.test").searchParams.get("sub"), odd);
    assert.equal(new URL(inviteAcceptPath(odd), "https://x.test").searchParams.get("token"), odd);
  });

  test("every routing file those paths point at exists as a static page", async () => {
    const { existsSync } = await import("node:fs");
    for (const route of ["notes/category", "notes/new", "notes/view", "trusted-friends/accept"]) {
      assert.ok(existsSync(path.join(ROOT, "app", route, "page.tsx")), route);
    }
    assert.ok(!existsSync(path.join(ROOT, "app", "notes", "[subcategoryId]")), "no dynamic segment remains");
  });
});

/** lib/config.ts reads the environment when it loads, as Next inlines it at build time. */
function loadConfig(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const id = require.resolve(path.join(ROOT, "lib", "config.ts"));
  delete require.cache[id];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id) as typeof import("@/lib/config");
  } finally {
    process.env = saved;
  }
}

describe("where the API is (lib/config.ts)", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  test("combined: paths stay relative", () => {
    const config = loadConfig({ NEXT_PUBLIC_API_BASE: undefined, NEXT_PUBLIC_NATIVE: undefined });
    assert.equal(config.API_BASE, "");
    assert.equal(config.apiUrl("/api/auth/session"), "/api/auth/session");
    assert.equal(config.IS_NATIVE_BUILD, false);
  });

  test("split: API paths go to the API host, trailing slashes trimmed", () => {
    const config = loadConfig({ NEXT_PUBLIC_API_BASE: "https://api.virasat.test///" });
    assert.equal(config.API_BASE, "https://api.virasat.test");
    assert.equal(config.apiUrl("/api/notes"), "https://api.virasat.test/api/notes");
    assert.equal(config.apiUrl("https://elsewhere.test/x"), "https://elsewhere.test/x", "absolute URLs are left alone");
    assert.equal(config.apiUrl("relative"), "relative");
  });

  test("links for other people point at the web host, never capacitor://localhost", () => {
    const split = loadConfig({ NEXT_PUBLIC_API_BASE: "https://api.virasat.test" });
    (globalThis as { window?: unknown }).window = { location: { origin: "capacitor://localhost" } };
    assert.equal(split.publicWebUrl("/trusted-friends/accept?token=t"), "https://api.virasat.test/trusted-friends/accept?token=t");

    const combined = loadConfig({ NEXT_PUBLIC_API_BASE: undefined });
    (globalThis as { window?: unknown }).window = { location: { origin: "http://localhost:3000" } };
    assert.equal(combined.publicWebUrl("/x"), "http://localhost:3000/x");
    delete (globalThis as { window?: unknown }).window;
    assert.equal(combined.publicWebUrl("/x"), "/x", "server-side, with no window");
  });

  test("the native build is recognised", () => {
    assert.equal(loadConfig({ NEXT_PUBLIC_NATIVE: "1" }).IS_NATIVE_BUILD, true);
    assert.equal(loadConfig({ NEXT_PUBLIC_NATIVE: "0" }).IS_NATIVE_BUILD, false);
  });
});

/** next.config.ts is read once per build, with that build's environment. */
function loadNextConfig(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const id = require.resolve(path.join(ROOT, "next.config.ts"));
  delete require.cache[id];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require(id) as { default: Record<string, unknown> }).default;
  } finally {
    process.env = saved;
  }
}

describe("the three builds (next.config.ts)", () => {
  test("combined has no special settings", () => {
    assert.deepEqual(loadNextConfig({ BUILD_TARGET: undefined, NEXT_PUBLIC_NATIVE: undefined }), {});
  });

  test("app is a static export with only .tsx routing files, so no route handler or proxy", () => {
    assert.deepEqual(loadNextConfig({ BUILD_TARGET: "app", NEXT_PUBLIC_NATIVE: undefined }), {
      output: "export",
      pageExtensions: ["tsx"],
    });
  });

  test("api marks the build as API-only for proxy.ts", () => {
    assert.deepEqual(loadNextConfig({ BUILD_TARGET: "api" }), { env: { VIRASAT_API_ONLY: "1" } });
  });

  test("the native build refuses to run without an API host", () => {
    assert.throws(
      () => loadNextConfig({ BUILD_TARGET: "app", NEXT_PUBLIC_NATIVE: "1", NEXT_PUBLIC_API_BASE: undefined }),
      /needs NEXT_PUBLIC_API_BASE/
    );
    assert.equal(
      loadNextConfig({ BUILD_TARGET: "app", NEXT_PUBLIC_NATIVE: "1", NEXT_PUBLIC_API_BASE: "https://api.x" }).output,
      "export"
    );
  });

  test("API route handlers are .ts and pages are .tsx, which is what the app build relies on", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/^(page|layout|loading|error|not-found|template)\.(ts|jsx?|mdx?)$/.test(entry)) bad.push(full);
        else if (/^route\.tsx$/.test(entry)) bad.push(full);
      }
    };
    walk(path.join(ROOT, "app"));
    assert.deepEqual(bad, [], "a page that is not .tsx would vanish from the app build; a .tsx route would break it");
  });
});
