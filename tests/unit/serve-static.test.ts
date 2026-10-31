import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "serve-static.mjs");

/** A miniature export: the shapes `next build` with output: "export" produces. */
function fixture(withNotFoundPage = true): string {
  const dir = mkdtempSync(path.join(tmpdir(), "virasat-static-"));
  const write = (rel: string, body: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), body);
  };
  write("index.html", "ROOT");
  write("notes.html", "NOTES");
  write("notes/view.html", "VIEW");
  write("notes/view.txt", "VIEW-PAYLOAD");
  write("help/index.html", "HELP-INDEX");
  write("_next/static/app.js", "JS");
  write("logo.svg", "<svg/>");
  write("blob.bin", "BIN");
  if (withNotFoundPage) write("404.html", "NOT-FOUND-PAGE");
  return dir;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

async function start(dir: string, mode?: string): Promise<{ base: string; child: ChildProcess }> {
  const port = await freePort();
  const child = spawn(process.execPath, [SCRIPT, dir, String(port), ...(mode ? [mode] : [])], { stdio: "pipe" });
  await new Promise<void>((resolve, reject) => {
    child.stdout!.on("data", (d) => String(d).includes("http://") && resolve());
    child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  return { base: `http://127.0.0.1:${port}`, child };
}

async function get(base: string, p: string) {
  const res = await fetch(base + p);
  return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
}

describe("serve-static: a static host for the export", () => {
  let dir: string;
  let server: { base: string; child: ChildProcess };
  before(async () => {
    dir = fixture();
    server = await start(dir);
  });
  after(() => {
    server.child.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  test("an exact file first, then path.html, then a directory index", async () => {
    assert.deepEqual(await get(server.base, "/_next/static/app.js"), { status: 200, type: "text/javascript; charset=utf-8", body: "JS" });
    assert.equal((await get(server.base, "/notes")).body, "NOTES", "notes.html, not the notes/ directory");
    assert.equal((await get(server.base, "/notes/view?sub=a.b&id=n")).body, "VIEW", "the query string is not part of the path");
    assert.equal((await get(server.base, "/notes/view.txt")).body, "VIEW-PAYLOAD");
    assert.equal((await get(server.base, "/help")).body, "HELP-INDEX");
    assert.equal((await get(server.base, "/")).body, "ROOT");
  });

  test("content types follow the file, with a safe default", async () => {
    assert.equal((await get(server.base, "/logo.svg")).type, "image/svg+xml");
    assert.equal((await get(server.base, "/notes")).type, "text/html; charset=utf-8");
    assert.equal((await get(server.base, "/blob.bin")).type, "application/octet-stream");
  });

  test("anything else is the export's 404 page, with a 404", async () => {
    assert.deepEqual(await get(server.base, "/nope"), { status: 404, type: "text/html; charset=utf-8", body: "NOT-FOUND-PAGE" });
  });

  test("refuses to leave the export directory, and a malformed path", async () => {
    // fetch() normalises "../", so speak HTTP directly.
    const { request } = await import("node:http");
    const raw = (p: string) =>
      new Promise<number>((resolve) => {
        const url = new URL(server.base);
        request({ host: url.hostname, port: url.port, path: p }, (res) => resolve(res.statusCode!)).end();
      });
    // The URL parser collapses plain and %2e dot segments, so these never
    // leave the export: they are simply not found.
    assert.equal(await raw("/../../etc/passwd"), 404);
    assert.equal(await raw("/%2e%2e/%2e%2e/etc/passwd"), 404);
    // An encoded slash survives parsing and decodes to "../": the guard.
    assert.equal(await raw("/..%2F..%2F..%2Fetc%2Fpasswd"), 400);
    assert.equal(await raw("/%E0%A4%A"), 400, "not valid percent-encoding");
  });
});

describe("serve-static --capacitor: the native shell's own rules", () => {
  let dir: string;
  let server: { base: string; child: ChildProcess };
  before(async () => {
    dir = fixture();
    server = await start(dir, "--capacitor");
  });
  after(() => {
    server.child.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  test("every extensionless path is the ROOT index.html, whatever page exists for it", async () => {
    for (const p of ["/", "/notes", "/notes/view?sub=a.b&id=n", "/help", "/nope"]) {
      assert.equal((await get(server.base, p)).body, "ROOT", p);
    }
  });

  test("a dotted last segment is a file, or a 404", async () => {
    assert.equal((await get(server.base, "/_next/static/app.js")).body, "JS");
    assert.equal((await get(server.base, "/notes/view.txt")).body, "VIEW-PAYLOAD");
    // This is why no app path may contain a dot (lib/routes.ts).
    assert.equal((await get(server.base, "/notes/banks.nominees")).status, 404);
  });
});

describe("serve-static without a 404 page", () => {
  test("says Not found", async () => {
    const dir = fixture(false);
    const server = await start(dir);
    try {
      assert.deepEqual(await get(server.base, "/nope"), { status: 404, type: "text/html; charset=utf-8", body: "Not found" });
    } finally {
      server.child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
