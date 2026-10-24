/**
 * Virasat - Where the app finds its API, and where browser links point.
 *
 * Two deployments come out of one repo (see next.config.ts):
 *
 * - **Combined** (dev, and the original test harness): the app and `/api` are
 *   one origin, so `NEXT_PUBLIC_API_BASE` is unset and every path stays
 *   relative.
 * - **Split**: the app is a static export shipped inside the native bundle,
 *   and `/api` runs on its own host. `NEXT_PUBLIC_API_BASE` is that host,
 *   inlined at build time.
 *
 * The literal `process.env.NEXT_PUBLIC_API_BASE` is what Next inlines; do not
 * read it through a variable.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

/** Absolute URL for an API path when the API lives elsewhere; unchanged otherwise. */
export function apiUrl(path: string): string {
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}

/**
 * A link that will be opened in a browser by someone else — an invitation, a
 * veto link. Inside the native app `window.location.origin` is
 * `capacitor://localhost`, which is meaningless to anyone receiving the link,
 * so these point at the web host, which is the API host.
 */
export function publicWebUrl(path: string): string {
  const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${path}`;
}

/**
 * The build that ships inside the iOS and Android shells (`npm run
 * build:native`). It uses the hardware-backed device bridge and never falls
 * back to the browser harness. Inlined at build time, like the API base.
 */
export const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE === "1";
