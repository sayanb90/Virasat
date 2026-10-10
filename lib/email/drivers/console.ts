import type { EmailAddress, EmailDriver, EmailMessage, SendResult } from "../types";

/**
 * The development and test driver. Sends nothing; records everything.
 *
 * This is the default on purpose. A half-configured deployment should print
 * mail to the log, not post it to a provider with someone's real address on
 * it — and tests need to assert what *would* have gone out without a network
 * call or an API key.
 */
export function createConsoleDriver(): EmailDriver {
  return {
    name: "console",
    ready: true,

    async send(message: EmailMessage, from: EmailAddress): Promise<SendResult> {
      if (process.env.NODE_ENV !== "test") {
        console.log(
          [
            "",
            "──────────── Virasat email (not sent: console driver) ────────────",
            `From:    ${from.name ? `${from.name} <${from.email}>` : from.email}`,
            `To:      ${message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email}`,
            `Subject: ${message.subject}`,
            `Key:     ${message.idempotencyKey}`,
            "",
            message.text,
            "──────────────────────────────────────────────────────────────────",
            "",
          ].join("\n")
        );
      }
      return { ok: true, providerId: `console-${message.idempotencyKey}` };
    },
  };
}
