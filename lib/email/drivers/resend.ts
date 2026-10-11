import type { EmailAddress, EmailDriver, EmailMessage, SendResult } from "../types";

const ENDPOINT = "https://api.resend.com/emails";

function formatAddress(a: EmailAddress): string {
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

/**
 * Resend. A single authenticated POST, so no SDK and no new dependency.
 *
 * Resend's own idempotency header means a retried send (a redeploy mid-ladder,
 * a duplicated webhook) does not produce a second copy on their side either.
 */
export function createResendDriver(apiKey: string | undefined): EmailDriver {
  return {
    name: "resend",
    ready: Boolean(apiKey),
    notReadyReason: apiKey ? undefined : "RESEND_API_KEY is not set.",

    async send(message: EmailMessage, from: EmailAddress): Promise<SendResult> {
      if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not set." };

      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: formatAddress(from),
            to: [formatAddress(message.to)],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
        });

        const body = (await res.json().catch(() => null)) as
          | { id?: string; message?: string; name?: string }
          | null;

        if (!res.ok) {
          return {
            ok: false,
            error: body?.message ?? `Resend returned ${res.status}.`,
          };
        }
        return { ok: true, providerId: body?.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Request to Resend failed." };
      }
    },
  };
}
