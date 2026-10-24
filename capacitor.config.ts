import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS and Android shells. Each carries the static export (`out/`) inside
 * its bundle and serves it from a local origin: capacitor://localhost on iOS,
 * https://localhost on Android. proxy.ts allows exactly those two for CORS.
 *
 * Build with `NEXT_PUBLIC_API_BASE=https://api… npm run build:native`, which
 * exports the app and copies it into both projects.
 */
const config: CapacitorConfig = {
  // The store identity. It cannot change once the app is published.
  appId: "com.virasat.app",
  appName: "Virasat",
  webDir: "out",
  ios: {
    // The page draws under the status bar itself (viewport-fit=cover).
    contentInset: "never",
  },
  android: {
    // Release builds must not be inspectable from a desktop Chrome.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
