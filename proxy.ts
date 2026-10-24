import { NextResponse, type NextRequest } from "next/server";

/**
 * Virasat - The API host's front door.
 *
 * Two jobs, and nothing else.
 *
 * 1. CORS for /api. The native app's UI is served from its own bundle, so
 *    every API call is cross-origin. Sessions are bearer tokens in the
 *    Authorization header — no cookies — so credentials are never allowed
 *    and none are needed. Only the native origins are trusted:
 *      capacitor://localhost   (iOS)
 *      https://localhost       (Android)
 *    plus anything listed in CORS_ALLOWED_ORIGINS, which exists for the test
 *    harness and must stay unset in production.
 *
 * 2. In the API build (VIRASAT_API_ONLY, set by next.config.ts), refuse to
 *    serve the app's screens. The app lives in the phone. What remains are
 *    the pages a browser opens from an email link: someone who has no
 *    Virasat account, or an owner on a desktop, has nowhere else to land.
 *
 * Absent from the static app build entirely — next.config limits that build
 * to .tsx routing files — because a static export cannot run a proxy.
 */

const NATIVE_ORIGINS = ["capacitor://localhost", "https://localhost"];

/** Pages reachable from an emailed link, served by the web host. */
const EMAIL_LINK_PAGES = ["/trusted-friends/accept", "/welcome/recover/cancel"];

function allowedOrigins(): Set<string> {
  const extra = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...NATIVE_ORIGINS, ...extra]);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

function api(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const allowed = origin !== null && allowedOrigins().has(origin);

  if (req.method === "OPTIONS") {
    // A preflight from anywhere else gets no CORS headers, so the browser
    // refuses the real request. 403 says so plainly in devtools.
    const res = allowed
      ? new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
      : new NextResponse(null, { status: 403 });
    res.headers.set("Vary", "Origin");
    return res;
  }

  const res = NextResponse.next();
  if (allowed) for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  // The answer depends on the Origin, so a cache must not share it across origins.
  res.headers.set("Vary", "Origin");
  return res;
}

function servedByWebHost(pathname: string): boolean {
  return EMAIL_LINK_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) return api(req);

  if (process.env.VIRASAT_API_ONLY === "1" && !servedByWebHost(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // Static assets are never gated: the email-link pages need their scripts.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
