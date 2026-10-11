import type { EmailAddress, EmailDriver, EmailMessage, SendResult } from "../types";

const ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

/**
 * SendGrid. Also a single authenticated POST, no SDK.
 *
 * Kept alongside Resend because SendGrid is the one most commonly already in
 * place on Indian infrastructure, and the point of the driver interface is
 * that having both costs almost nothing.
 *
 * Note: SendGrid returns 202 with an empty body on success, and carries no
 * idempotency header — duplicate suppression is the app's job, which is what
 * `dispatch.ts` does regardless of driver.
 */
export function createSendGridDriver(apiKey: string | undefined): EmailDriver {
  return {
    name: "sendgrid",
    ready: Boolean(apiKey),
    notReadyReason: apiKey ? undefined : "SENDGRID_API_KEY is not set.",

    async send(message: EmailMessage, from: EmailAddress): Promise<SendResult> {
      if (!apiKey) return { ok: false, error: "SENDGRID_API_KEY is not set." };

      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [
              {
                to: [{ email: message.to.email, ...(message.to.name ? { name: message.to.name } : {}) }],
                custom_args: { idempotency_key: message.idempotencyKey },
              },
            ],
            from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
            subject: message.subject,
            content: [
              { type: "text/plain", value: message.text },
              ...(message.html ? [{ type: "text/html", value: message.html }] : []),
            ],
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return { ok: false, error: detail || `SendGrid returned ${res.status}.` };
        }
        // 202 Accepted, empty body. The message id is only in the headers.
        return { ok: true, providerId: res.headers.get("x-message-id") ?? undefined };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Request to SendGrid failed." };
      }
    },
  };
}
