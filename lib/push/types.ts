/** Virasat - Push notifications: the shapes every driver shares. */

export type PushPlatform = "ios" | "android";

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  /**
   * Shown on the lock screen, to anyone holding the phone. Never a note, a
   * name or an amount: only that something needs the Owner, in Virasat.
   */
  title: string;
  body: string;
  /** For the app, when the notification is tapped. Not shown. */
  data?: Record<string, string>;
}

export type PushResult =
  | { ok: true }
  /** `gone`: the service says this token will never work again; forget it. */
  | { ok: false; error: string; gone?: boolean };

export interface PushDriver {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}
