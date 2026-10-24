// Serves the static app export for the split-mode e2e run.
//
// Deliberately tiny and dependency-free. It resolves a path the way a static
// host must for this export:
//
//   1. an exact file            /_next/static/x.js, /notes/view.txt
//   2. the path plus ".html"    /notes            -> notes.html
//   3. a directory index        /                 -> index.html
//
// Order matters. "/notes/banks.nominees" is BOTH banks.nominees.html and a
// directory (holding new.html and the client-navigation payloads). A
// directory is not a file, so step 1 skips it and step 2 serves the page; a
// host that tried the directory first would 404 every dotted category id.
//
// --capacitor mimics the native shell's own local server instead, exactly:
// "/" or a path whose last segment has no file extension gets the ROOT
// index.html; anything else is opened as a file or 404s. (Android
// WebViewLocalServer.handleLocalRequest; iOS Router.route.) Use it to see
// what a phone does when the WebView reloads a deep URL.
//
// Usage: node scripts/serve-static.mjs <dir> <port> [--capacitor]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const [, , dirArg = "out", portArg = "3398", modeArg] = process.argv;
const capacitor = modeArg === "--capacitor";
const root = resolve(dirArg);
const port = Number(portArg);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  const target = normalize(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(400).end(); // path traversal
    return;
  }

  const lastSegment = pathname.split("/").pop() ?? "";
  const candidates = capacitor
    ? pathname === "/" || !lastSegment.includes(".")
      ? [join(root, "index.html")]
      : [target]
    : [target, `${target}.html`, join(target, "index.html")];
  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      res.writeHead(200, { "Content-Type": TYPES[extname(candidate)] ?? "application/octet-stream" });
      res.end(await readFile(candidate));
      return;
    }
  }

  const notFound = join(root, "404.html");
  res.writeHead(404, { "Content-Type": TYPES[".html"] });
  res.end((await isFile(notFound)) ? await readFile(notFound) : "Not found");
}).listen(port, "127.0.0.1", () => {
  console.log(`static${capacitor ? " (capacitor rules)" : ""}: ${root} on http://127.0.0.1:${port}`);
});
