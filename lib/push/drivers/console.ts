import type { PushDriver, PushMessage } from "../types";

/** Messages the console driver has "sent", newest last. Tests read this. */
export const pushOutbox: PushMessage[] = [];

export function resetPushOutbox(): void {
  pushOutbox.length = 0;
}

/**
 * The default. Sends nothing: prints that it would have, and keeps the
 * message for the specs. Like email's console driver, a deployment that
 * forgot to configure push logs rather than failing.
 */
export function createConsolePushDriver(): PushDriver {
  return {
    name: "console",
    async send(message) {
      pushOutbox.push(message);
      console.info(`[push:console] ${message.platform} …${message.token.slice(-6)}: ${message.title}`);
      return { ok: true };
    },
  };
}
