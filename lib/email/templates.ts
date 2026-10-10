/**
 * Virasat - Email copy.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE RULE, which is not negotiable and is enforced by a test:
 *
 *   No email this app sends may contain key material, passphrase material,
 *   or any decrypted note content.
 *
 * Email is plaintext in transit between providers, sits forever in two or
 * more inboxes, and is the single most commonly breached thing a person
 * owns. An email that carries the key to the vault *is* the vault. So a
 * Virasat email only ever says "something has happened, here is where to go"
 * — the secret itself is reached by the recipient, on a device they control,
 * with a key the server never had.
 *
 * `features/08_email_delivery.feature` asserts this against every template.
 * If you add a template, add it to that scenario's table.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Voice: this audience is 65+ and may be reading on a small phone in a
 * second language. Short sentences. No jargon. Never the words "dead man's
 * switch", "escalation", "cryptographic" or "payload". Say what happened and
 * what to do, in that order.
 */

import type { EmailMessage } from "./types";

export interface TemplateContext {
  /** Absolute base URL for links, e.g. https://virasat.app */
  appUrl: string;
}

function link(ctx: TemplateContext, path: string): string {
  return `${ctx.appUrl.replace(/\/+$/, "")}${path}`;
}

const SIGN_OFF = "— Virasat";

/** Wraps plain text in minimal, high-contrast, large-type HTML. */
export function toHtml(subject: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 18px;font-size:17px;line-height:1.65;color:#11161c;">${p}</p>`)
    .join("\n      ");

  const button = cta
    ? `<p style="margin:28px 0;"><a href="${cta.url}" style="display:inline-block;padding:18px 28px;font-size:18px;font-weight:600;color:#ffffff;background:#0b6e7f;border-radius:14px;text-decoration:none;">${cta.label}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f7f8fb;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;">
    <h1 style="margin:0 0 20px;font-size:23px;line-height:1.3;color:#11161c;">${subject}</h1>
      ${body}
    ${button}
    <p style="margin:28px 0 0;font-size:15px;color:#5b6472;">${SIGN_OFF}</p>
  </div>
</body></html>`;
}

/* ---------------------------------------------------------------------- */
/* Trusted Friend invitation                                              */
/* ---------------------------------------------------------------------- */

export function trustedFriendInvite(
  ctx: TemplateContext,
  args: { friendName: string; friendEmail: string; ownerName: string; inviteToken: string }
): EmailMessage {
  const url = link(ctx, `/trusted-friends/accept/${encodeURIComponent(args.inviteToken)}`);
  const subject = `${args.ownerName} has asked you to be a Trusted Friend`;

  const paragraphs = [
    `Hello ${args.friendName},`,
    `${args.ownerName} uses Virasat to keep important details safe for their family, and has named you as someone they trust.`,
    `There is nothing for you to look after and nothing to pay. You are simply someone we may contact if we ever cannot reach ${args.ownerName}.`,
    `To accept, open the link below. It is just for you, so please do not forward it.`,
  ];

  return {
    to: { email: args.friendEmail, name: args.friendName },
    subject,
    text: [
      ...paragraphs,
      "",
      url,
      "",
      `If you were not expecting this, you can ignore this email and nothing will happen.`,
      "",
      SIGN_OFF,
    ].join("\n"),
    html: toHtml(subject, paragraphs, { label: "Accept", url }),
    idempotencyKey: `tf-invite:${args.inviteToken}`,
  };
}

/* ---------------------------------------------------------------------- */
/* Safety check-in ladder, to the owner                                   */
/* ---------------------------------------------------------------------- */

export type LadderTone = "gentle" | "urgent" | "critical";

export function safetyCheckIn(
  ctx: TemplateContext,
  args: {
    ownerName: string;
    ownerEmail: string;
    tone: LadderTone;
    daysUntilRelease: number;
    notificationId: string;
  }
): EmailMessage {
  const url = link(ctx, "/heartbeat");
  const days = args.daysUntilRelease;

  const subject =
    args.tone === "gentle"
      ? "A quick hello from Virasat"
      : args.tone === "urgent"
        ? "Please let us know you are well"
        : "We still have not heard from you";

  const opening =
    args.tone === "gentle"
      ? `It has been a while since we heard from you, so this is just a friendly hello.`
      : args.tone === "urgent"
        ? `We have written a few times and have not heard back, so we wanted to try again.`
        : `We have not been able to reach you, and we do not want to pass anything on by mistake.`;

  const consequence =
    days > 0
      ? `If we do not hear from you in the next ${days} ${days === 1 ? "day" : "days"}, we will share what you saved with the people you chose. That is what you asked us to do — we would just rather hear from you first.`
      : `We will shortly share what you saved with the people you chose, which is what you asked us to do.`;

  const paragraphs = [
    `Hello ${args.ownerName},`,
    opening,
    `All you need to do is open Virasat and tap <strong>I am safe and well</strong>. It takes a moment, and then we will leave you in peace.`,
    consequence,
  ];

  return {
    to: { email: args.ownerEmail, name: args.ownerName },
    subject,
    text: [
      `Hello ${args.ownerName},`,
      opening,
      `All you need to do is open Virasat and tap "I am safe and well". It takes a moment, and then we will leave you in peace.`,
      consequence,
      "",
      url,
      "",
      SIGN_OFF,
    ].join("\n"),
    html: toHtml(subject, paragraphs, { label: "I am safe and well", url }),
    idempotencyKey: `ladder:${args.notificationId}`,
  };
}

/* ---------------------------------------------------------------------- */
/* Release, to a beneficiary                                              */
/* ---------------------------------------------------------------------- */

/**
 * The one that matters most, and the one most likely to be got wrong.
 *
 * This email does NOT carry the notes, a key, or a link that hands over a
 * key. It tells the person that something has been left to them and where to
 * go. Opening it requires the recovery key they were given separately, which
 * this email deliberately does not contain and the server must not hold.
 */
export function beneficiaryRelease(
  ctx: TemplateContext,
  args: {
    beneficiaryName: string;
    beneficiaryEmail: string;
    ownerName: string;
    noteCount: number;
    releaseId: string;
  }
): EmailMessage {
  const url = link(ctx, "/claim");
  const subject = `${args.ownerName} left something for you`;
  const count =
    args.noteCount === 1 ? "a note" : `${args.noteCount} notes`;

  const paragraphs = [
    `Hello ${args.beneficiaryName},`,
    `Some time ago, ${args.ownerName} wrote down details their family might one day need, and asked Virasat to pass them to you. We have not heard from them for a long time, so we are doing as they asked.`,
    `There ${args.noteCount === 1 ? "is" : "are"} ${count} waiting for you.`,
    `To read ${args.noteCount === 1 ? "it" : "them"} you will need the recovery key ${args.ownerName} gave you to keep safe. <strong>It is not in this email, and we do not have a copy</strong> — that is what stops anyone else, us included, from reading what they wrote.`,
    `If you cannot find your recovery key, please speak to ${args.ownerName}'s family. Without it, the notes cannot be opened by anyone.`,
  ];

  return {
    to: { email: args.beneficiaryEmail, name: args.beneficiaryName },
    subject,
    text: [
      `Hello ${args.beneficiaryName},`,
      `Some time ago, ${args.ownerName} wrote down details their family might one day need, and asked Virasat to pass them to you. We have not heard from them for a long time, so we are doing as they asked.`,
      `There ${args.noteCount === 1 ? "is" : "are"} ${count} waiting for you.`,
      `To read ${args.noteCount === 1 ? "it" : "them"} you will need the recovery key ${args.ownerName} gave you to keep safe. It is not in this email, and we do not have a copy - that is what stops anyone else, us included, from reading what they wrote.`,
      `If you cannot find your recovery key, please speak to ${args.ownerName}'s family. Without it, the notes cannot be opened by anyone.`,
      "",
      url,
      "",
      SIGN_OFF,
    ].join("\n"),
    html: toHtml(subject, paragraphs, { label: "Open Virasat", url }),
    idempotencyKey: `release:${args.releaseId}`,
  };
}
