/**
 * Virasat - The providers' own sign-in sheets, inside the iOS and Android apps.
 *
 * Apple, Google and Facebook show their sheet; what comes back is a token,
 * which goes to our server unread (lib/auth/providers/native.ts decides
 * whether to believe it). Nothing here is trusted on its own.
 *
 * One plugin, @capgo/capacitor-social-login, covers all three. This module
 * keeps it behind a small interface so the rest of the app, and the tests,
 * never touch it directly.
 *
 * Which providers appear:
 *   Apple      iOS only. On Android, Sign in with Apple is a web flow that
 *              needs a Services ID and a redirect on our server; not built.
 *              (App Store rule 4.8 requires it only where iOS offers others.)
 *   Google     when its client id for the platform is set
 *   Facebook   when its app id and client token are set
 *
 * Build-time settings, inlined like the API base (read literally):
 *   NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID, NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
 *   NEXT_PUBLIC_FACEBOOK_APP_ID, NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN
 */

import type { InitializeOptions, LoginOptions } from "@capgo/capacitor-social-login";
import type { SocialProvider } from "./types";

export interface ProviderSheetResult {
  token: string;
  /** Only Apple's, which is not in its token and is given once. */
  name: string | null;
}

export interface SocialSheets {
  /** In the order to show them: Apple first, as App Store rule 4.8 asks. */
  available(): SocialProvider[];
  /** Resolves null if the person closed the sheet. */
  signIn(provider: SocialProvider, nonce: string): Promise<ProviderSheetResult | null>;
}

/** Each provider answers differently; the app reads only these fields. */
export interface SheetAnswer {
  result: unknown;
}

interface SheetFields {
  idToken?: string | null;
  accessToken?: { token?: string } | null;
  profile?: { givenName?: string | null; familyName?: string | null } | null;
}

/** The part of the plugin this app uses. */
export interface SocialLoginPlugin {
  initialize(options: InitializeOptions): Promise<void>;
  login(options: LoginOptions): Promise<SheetAnswer>;
}

export interface SocialSheetsConfig {
  googleIosClientId?: string;
  googleWebClientId?: string;
  facebookAppId?: string;
  facebookClientToken?: string;
}

/** The literal reads are what Next inlines into the bundle. */
export function socialSheetsConfigFromBuild(): SocialSheetsConfig {
  return {
    googleIosClientId: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    googleWebClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
    facebookAppId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || undefined,
    facebookClientToken: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN || undefined,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A closed sheet is not an error. Each SDK words it differently. */
function isCancellation(err: unknown): boolean {
  const text = `${(err as { code?: string })?.code ?? ""} ${(err as Error)?.message ?? String(err)}`;
  return /cancel/i.test(text) || /\b1001\b/.test(text); // 1001: ASAuthorizationError.canceled
}

function joinName(...parts: Array<string | null | undefined>): string | null {
  const name = parts.filter(Boolean).join(" ").trim();
  return name || null;
}

export function createNativeSocialSheets(
  plugin: SocialLoginPlugin,
  platform: "ios" | "android",
  config: SocialSheetsConfig
): SocialSheets {
  const google = platform === "ios" ? config.googleIosClientId : config.googleWebClientId;
  const facebook = config.facebookAppId && config.facebookClientToken;
  const providers: SocialProvider[] = [
    ...(platform === "ios" ? (["apple"] as const) : []),
    ...(google ? (["google"] as const) : []),
    ...(facebook ? (["facebook"] as const) : []),
  ];

  let initialised: Promise<void> | null = null;
  const initialise = () =>
    (initialised ??= plugin
      .initialize({
        ...(platform === "ios" ? { apple: {} } : {}),
        ...(google
          ? {
              google: {
                ...(platform === "ios" ? { iOSClientId: config.googleIosClientId } : {}),
                // The server checks the ID token's audience against this.
                webClientId: config.googleWebClientId,
                mode: "online" as const,
              },
            }
          : {}),
        ...(facebook ? { facebook: { appId: config.facebookAppId!, clientToken: config.facebookClientToken } } : {}),
      })
      .catch((err) => {
        initialised = null; // try again next time
        throw err;
      }));

  return {
    available: () => [...providers],

    async signIn(provider, nonce) {
      if (!providers.includes(provider)) throw new Error("That sign-in is not available in this app.");
      await initialise();
      let answer: SheetAnswer;
      try {
        if (provider === "apple") {
          // Apple asks for the nonce's SHA-256; its token carries the hash.
          answer = await plugin.login({ provider, options: { scopes: ["name", "email"], nonce: await sha256Hex(nonce) } });
        } else if (provider === "google") {
          answer = await plugin.login({ provider, options: { scopes: ["email", "profile"], nonce } });
        } else {
          answer = await plugin.login({ provider, options: { permissions: ["email", "public_profile"], nonce } });
        }
      } catch (err) {
        if (isCancellation(err)) return null;
        throw err;
      }

      const r = (answer.result ?? {}) as SheetFields;
      // Facebook: Limited Login (iOS) gives an ID token, otherwise a classic
      // access token. Apple and Google always give an ID token.
      const token = r.idToken || (provider === "facebook" ? r.accessToken?.token : undefined);
      if (!token) return null;
      return { token, name: provider === "apple" ? joinName(r.profile?.givenName, r.profile?.familyName) : null };
    },
  };
}

let shared: Promise<SocialSheets> | null = null;

/**
 * The app's sheets. The plugin is loaded on first use, so the browser
 * harness's bundle never loads it. Outside the iOS or Android app there are
 * none: the harness uses its own test sheet instead (SocialButtons).
 */
export function socialSheets(): Promise<SocialSheets> {
  return (shared ??= (async () => {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform !== "ios" && platform !== "android") {
      return {
        available: () => [],
        signIn: async () => {
          throw new Error("Apple, Google and Facebook sign-in open only in the Virasat app.");
        },
      };
    }
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    return createNativeSocialSheets(SocialLogin, platform, socialSheetsConfigFromBuild());
  })());
}
