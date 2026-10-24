import type { NextConfig } from "next";

/**
 * One repo, three builds, chosen by BUILD_TARGET:
 *
 *   (unset)  Combined. App and /api on one origin. Development, and the
 *            original single-server test harness.
 *
 *   app      The UI as a static export (`out/`), which the native app ships
 *            inside its bundle. `pageExtensions: ["tsx"]` is what removes the
 *            server: every route handler is `route.ts` and the proxy is
 *            `proxy.ts`, and a static export supports neither, so limiting
 *            routing files to `.tsx` drops all of them without moving a
 *            file. Every routing file outside app/api is `.tsx` — keep it
 *            that way, or it will silently vanish from the app build.
 *            Set NEXT_PUBLIC_API_BASE to the API host.
 *
 *   api      The same app, deployed as the API host. proxy.ts limits it to
 *            /api and the few pages a browser opens from an email link, and
 *            answers CORS for the native app's origins.
 */
const target = process.env.BUILD_TARGET;

const nextConfig: NextConfig =
  target === "app"
    ? { output: "export", pageExtensions: ["tsx"] }
    : target === "api"
      ? { env: { VIRASAT_API_ONLY: "1" } }
      : {};

export default nextConfig;
