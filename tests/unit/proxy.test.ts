import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

function request(path: string, init: { method?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (init.origin) headers.set("origin", init.origin);
  return new NextRequest(new URL(path, "https://api.virasat.test"), { method: init.method ?? "GET", headers });
}

/** NextResponse.next() marks a pass-through with this header. */
const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => {
  delete process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.VIRASAT_API_ONLY;
});

describe("CORS for /api", () => {
  for (const origin of ["capacitor://localhost", "https://localhost"]) {
    test(`the native app's origin ${origin} gets a preflight and its headers`, () => {
      const pre = proxy(request("/api/auth/login", { method: "OPTIONS", origin }));
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get("access-control-allow-origin"), origin);
      assert.equal(pre.headers.get("access-control-allow-headers"), "Authorization, Content-Type");
      assert.match(pre.headers.get("access-control-allow-methods")!, /POST/);
      assert.equal(pre.headers.get("access-control-allow-credentials"), null, "never credentialed: no cookies");
      assert.equal(pre.headers.get("vary"), "Origin");

      const real = proxy(request("/api/auth/login", { method: "POST", origin }));
      assert.ok(passesThrough(real));
      assert.equal(real.headers.get("access-control-allow-origin"), origin);
      assert.equal(real.headers.get("vary"), "Origin");
    });
  }

  test("any other origin is refused a preflight and gets no CORS headers", () => {
    for (const origin of ["https://evil.test", "capacitor://localhost.evil.test", "http://localhost", "null"]) {
      const pre = proxy(request("/api/notes", { method: "OPTIONS", origin }));
      assert.equal(pre.status, 403, origin);
      assert.equal(pre.headers.get("access-control-allow-origin"), null);
      assert.equal(pre.headers.get("vary"), "Origin");
      const real = proxy(request("/api/notes", { origin }));
      assert.equal(real.headers.get("access-control-allow-origin"), null, origin);
    }
  });

  test("a preflight without an Origin is refused; a same-origin request passes untouched", () => {
    assert.equal(proxy(request("/api/notes", { method: "OPTIONS" })).status, 403);
    const same = proxy(request("/api/notes"));
    assert.ok(passesThrough(same));
    assert.equal(same.headers.get("access-control-allow-origin"), null);
  });

  test("CORS_ALLOWED_ORIGINS adds the test harness's origins, trimmed", () => {
    process.env.CORS_ALLOWED_ORIGINS = " http://127.0.0.1:3398 , ,http://127.0.0.1:3397";
    for (const origin of ["http://127.0.0.1:3398", "http://127.0.0.1:3397", "capacitor://localhost"]) {
      assert.equal(proxy(request("/api/x", { method: "OPTIONS", origin })).status, 204, origin);
    }
    assert.equal(proxy(request("/api/x", { method: "OPTIONS", origin: "http://127.0.0.1:9999" })).status, 403);
  });
});

describe("the API-only host", () => {
  test("serves /api and the pages opened from an email, and 404s every app screen", () => {
    process.env.VIRASAT_API_ONLY = "1";
    for (const path of ["/notes", "/", "/settings", "/welcome", "/notes/view?sub=a&id=b", "/trusted-friends"]) {
      assert.equal(proxy(request(path)).status, 404, path);
    }
    for (const path of ["/trusted-friends/accept?token=t", "/welcome/recover/cancel?token=t", "/trusted-friends/accept/x"]) {
      assert.ok(passesThrough(proxy(request(path))), path);
    }
    assert.ok(passesThrough(proxy(request("/api/auth/session"))));
    // A prefix that only looks like an email page is still an app screen.
    assert.equal(proxy(request("/trusted-friends/acceptance")).status, 404);
  });

  test("the combined build serves everything", () => {
    for (const path of ["/notes", "/settings", "/trusted-friends/accept"]) {
      assert.ok(passesThrough(proxy(request(path))), path);
    }
  });
});

describe("matcher", () => {
  test("skips Next's static files and the favicon", () => {
    const [pattern] = config.matcher as string[];
    const re = new RegExp(`^${pattern}$`);
    for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) assert.ok(!re.test(path), path);
    for (const path of ["/api/notes", "/notes", "/"]) assert.ok(re.test(path), path);
  });
});
