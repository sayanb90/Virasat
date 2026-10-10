/**
 * Virasat - Mailer.
 *
 * Driver is chosen by environment, defaulting to `console`: a deployment that
 * forgot to configure email prints to the log rather than silently dropping a
 * release notice, and never posts a real address to an unconfigured provider.
 *
 * Configuration:
 *   EMAIL_DRIVER     console (default) | resend | sendgrid
 *   EMAIL_FROM       e.g. "Virasat <hello@virasat.app>"   (required for real sends)
 *   APP_URL          e.g. "https://virasat.app"           (links in emails)
 *   RESEND_API_KEY   when EMAIL_DRIVER=resend
 *   SENDGRID_API_KEY when EMAIL_DRIVER=sendgrid
 */

import { createConsoleDriver } from "./drivers/console";
import { createResendDriver } from "./drivers/resend";
import { createSendGridDriver } from "./drivers/sendgrid";
import { alreadySent, record } from "./outbox";
import type { EmailAddress, EmailDriver, EmailMessage, SendResult } from "./types";
import type { TemplateContext } from "./templates";

const DEFAULT_FROM: EmailAddress = { email: "hello@virasat.local", name: "Virasat" };
const DEFAULT_APP_URL = "http://localhost:3000";

/** Parses `Name <addr@host>` or a bare address. */
export function parseFrom(raw: string | undefined): EmailAddress {
  if (!raw) return DEFAULT_FROM;
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: raw.trim() };
}

export function resolveDriver(): EmailDriver {
  switch ((process.env.EMAIL_DRIVER ?? "console").toLowerCase()) {
    case "resend":
      return createResendDriver(process.env.RESEND_API_KEY);
    case "sendgrid":
      return createSendGridDriver(process.env.SENDGRID_API_KEY);
    case "console":
      return createConsoleDriver();
    default:
      // An unrecognised driver name is a configuration mistake, and silently
      // falling back to console would hide it. Report it instead.
      return {
        name: `unknown:${process.env.EMAIL_DRIVER}`,
        ready: false,
        notReadyReason: `EMAIL_DRIVER="${process.env.EMAIL_DRIVER}" is not a driver. Use console, resend or sendgrid.`,
        async send() {
          return { ok: false, error: `EMAIL_DRIVER="${process.env.EMAIL_DRIVER}" is not a driver.` };
        },
      };
  }
}

export function templateContext(): TemplateContext {
  return { appUrl: process.env.APP_URL ?? DEFAULT_APP_URL };
}

export interface MailerStatus {
  driver: string;
  ready: boolean;
  reason?: string;
  from: string;
  appUrl: string;
}

export function mailerStatus(): MailerStatus {
  const driver = resolveDriver();
  const from = parseFrom(process.env.EMAIL_FROM);
  return {
    driver: driver.name,
    ready: driver.ready,
    reason: driver.notReadyReason,
    from: from.name ? `${from.name} <${from.email}>` : from.email,
    appUrl: templateContext().appUrl,
  };
}

/**
 * Sends one message, at most once.
 *
 * Never throws: a provider outage must not take down the route that triggered
 * it — above all `/api/heartbeat`, which a user loads to tell us they are
 * alive. The result says what happened and the outbox records it.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult & { skipped?: boolean }> {
  if (alreadySent(message.idempotencyKey)) {
    return { ok: true, skipped: true };
  }

  const driver = resolveDriver();
  const from = parseFrom(process.env.EMAIL_FROM);

  if (!driver.ready) {
    const error = driver.notReadyReason ?? `Email driver "${driver.name}" is not configured.`;
    record({
      idempotencyKey: message.idempotencyKey,
      to: message.to.email,
      subject: message.subject,
      driver: driver.name,
      status: "failed",
      error,
      at: new Date().toISOString(),
    });
    return { ok: false, error };
  }

  let result: SendResult;
  try {
    result = await driver.send(message, from);
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "Email driver threw." };
  }

  record({
    idempotencyKey: message.idempotencyKey,
    to: message.to.email,
    subject: message.subject,
    driver: driver.name,
    status: result.ok ? "sent" : "failed",
    providerId: result.providerId,
    error: result.error,
    at: new Date().toISOString(),
  });

  return result;
}

export { listOutbox, resetOutbox, alreadySent } from "./outbox";
export type { EmailMessage, EmailAddress, EmailDriver, SendResult } from "./types";
