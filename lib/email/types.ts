/**
 * Virasat - Email transport contract.
 *
 * Deliberately provider-agnostic. The app composes messages; a driver puts
 * them on the wire. Swapping Resend for SendGrid, or for a provider that does
 * not exist yet, must not touch a single template or caller.
 *
 * What a Virasat email may contain is a security question, not a formatting
 * one. See the rule in `templates.ts`: no email this app sends ever carries
 * key material, passphrase material or decrypted note content.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  to: EmailAddress;
  subject: string;
  /** Plain text is mandatory. Many of this audience read mail as text. */
  text: string;
  /** HTML is optional and must carry no information the text lacks. */
  html?: string;
  /**
   * Stable identity for this exact message, so a ladder that is recomputed on
   * every read cannot send the same reminder twice. See `dispatch.ts`.
   */
  idempotencyKey: string;
}

export interface SendResult {
  ok: boolean;
  /** The provider's own id, when it gives one. Useful for support requests. */
  providerId?: string;
  error?: string;
}

export interface EmailDriver {
  /** Short name for logs, the audit trail and `GET /api/email/status`. */
  readonly name: string;
  /**
   * True when the driver has everything it needs to actually deliver. A
   * driver missing its API key reports false rather than throwing on first
   * send, so the app can degrade loudly instead of silently dropping mail.
   */
  readonly ready: boolean;
  /** Why it is not ready, when it is not. */
  readonly notReadyReason?: string;
  send(message: EmailMessage, from: EmailAddress): Promise<SendResult>;
}
