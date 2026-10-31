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

import { inviteAcceptPath } from "../routes";
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
  const url = link(ctx, inviteAcceptPath(args.inviteToken));
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

/* ---------------------------------------------------------------------- */
/* Sign-in                                                                */
/* ---------------------------------------------------------------------- */

/*
 * A six-digit code is not key material: it proves the reader owns the inbox,
 * is useless after ten minutes or five wrong tries, and opens nothing on its
 * own. Every sign-in email still follows THE RULE above.
 */

export type CodeEmailPurpose = "signup" | "new-device" | "reset" | "recover";

const CODE_REASON: Record<CodeEmailPurpose, { subject: string; why: string }> = {
  signup: {
    subject: "Your Virasat code",
    why: "Here is the code to confirm your email address and finish setting up Virasat.",
  },
  "new-device": {
    subject: "Your Virasat code for a new phone",
    why: "Someone is signing in to your Virasat account on a phone it has not seen before. If that is you, here is the code.",
  },
  reset: {
    subject: "Your Virasat code to change your password",
    why: "Here is the code to choose a new Virasat password on your phone.",
  },
  recover: {
    subject: "Your Virasat code to recover your account",
    why: "Here is the code to start recovering your Virasat account with your Recovery Kit.",
  },
};

export function verificationCode(
  _ctx: TemplateContext,
  args: { email: string; code: string; purpose: CodeEmailPurpose; sendId: string }
): EmailMessage {
  const { subject, why } = CODE_REASON[args.purpose];
  const spaced = `${args.code.slice(0, 3)} ${args.code.slice(3)}`;
  const paragraphs = [
    `Hello,`,
    why,
    `<strong style="font-size:28px;letter-spacing:4px;">${spaced}</strong>`,
    `The code works for 10 minutes. Nobody from Virasat will ever ask you for it.`,
    `If you did not ask for this, you can ignore this email. Nothing will change.`,
  ];
  return {
    to: { email: args.email },
    subject,
    text: [
      `Hello,`,
      why,
      "",
      `    ${spaced}`,
      "",
      `The code works for 10 minutes. Nobody from Virasat will ever ask you for it.`,
      `If you did not ask for this, you can ignore this email. Nothing will change.`,
      "",
      SIGN_OFF,
    ].join("\n"),
    html: toHtml(subject, paragraphs),
    idempotencyKey: `code:${args.purpose}:${args.sendId}`,
  };
}

/** Sent instead of a sign-up code when the address already has an account. */
export function alreadyRegistered(
  ctx: TemplateContext,
  args: { email: string; sendId: string }
): EmailMessage {
  const subject = "You already have a Virasat account";
  const paragraphs = [
    `Hello,`,
    `Someone tried to create a new Virasat account with this email address. You already have one, so nothing new was made.`,
    `To get back in, open Virasat and sign in. If you have forgotten your password, choose "Forgot password?" on the sign-in screen.`,
  ];
  return {
    to: { email: args.email },
    subject,
    text: [...paragraphs, "", SIGN_OFF].join("\n"),
    html: toHtml(subject, paragraphs),
    idempotencyKey: `already-registered:${args.sendId}`,
  };
}

export function newDeviceSignedIn(
  ctx: TemplateContext,
  args: { email: string; name: string; deviceName: string; deviceId: string }
): EmailMessage {
  const url = link(ctx, "/settings");
  const subject = "A new phone signed in to Virasat";
  const paragraphs = [
    `Hello ${args.name},`,
    `Your Virasat account was just set up on a new phone: <strong>${args.deviceName}</strong>.`,
    `If that was you, there is nothing to do.`,
    `If it was not you, open Virasat on your own phone, go to Settings, and remove it. Then change your password.`,
  ];
  return {
    to: { email: args.email, name: args.name },
    subject,
    text: [
      `Hello ${args.name},`,
      `Your Virasat account was just set up on a new phone: ${args.deviceName}.`,
      `If that was you, there is nothing to do.`,
      `If it was not you, open Virasat on your own phone, go to Settings, and remove it. Then change your password.`,
      "",
      url,
      "",
      SIGN_OFF,
    ].join("\n"),
    html: toHtml(subject, paragraphs, { label: "Open Settings", url }),
    idempotencyKey: `new-device:${args.deviceId}`,
  };
}

export function passwordChanged(
  _ctx: TemplateContext,
  args: { email: string; name: string; sendId: string }
): EmailMessage {
  const subject = "Your Virasat password was changed";
  const paragraphs = [
    `Hello ${args.name},`,
    `Your Virasat password has just been changed. Any other phone signed in to your account will be asked to sign in again.`,
    `If you did not do this, please contact us straight away by replying to this email.`,
  ];
  return {
    to: { email: args.email, name: args.name },
    subject,
    text: [...paragraphs, "", SIGN_OFF].join("\n"),
    html: toHtml(subject, paragraphs),
    idempotencyKey: `password-changed:${args.sendId}`,
  };
}

/**
 * The Owner's veto on a Recovery Kit recovery (the Authentication design page (Notion) 3.6).
 * One tap cancels it. Cancelling can only ever delay a recovery, never
 * expose anything, so the link alone is enough.
 */
export function recoveryStarted(
  ctx: TemplateContext,
  args: { email: string; name: string; releasableAt: Date; cancelToken: string; recoveryId: string }
): EmailMessage {
  const url = link(ctx, `/welcome/recover/cancel#${encodeURIComponent(args.cancelToken)}`);
  const when = args.releasableAt.toUTCString().replace(/:\d\d GMT$/, " GMT");
  const subject = "Someone is recovering your Virasat account";
  const paragraphs = [
    `Hello ${args.name},`,
    `Someone has started recovering your Virasat account using your Recovery Kit. If nobody stops it, they will be able to choose a new password on <strong>${when}</strong>.`,
    `<strong>If this is you</strong>, there is nothing to do. Please wait until then.`,
    `<strong>If this is not you</strong>, tap the button below. It stops the recovery straight away, and nothing else changes.`,
  ];
  return {
    to: { email: args.email, name: args.name },
    subject,
    text: [
      `Hello ${args.name},`,
      `Someone has started recovering your Virasat account using your Recovery Kit. If nobody stops it, they will be able to choose a new password on ${when}.`,
      `If this is you, there is nothing to do. Please wait until then.`,
      `If this is not you, open the link below. It stops the recovery straight away, and nothing else changes.`,
      "",
      url,
      "",
      SIGN_OFF,
    ].join("\n"),
    html: toHtml(subject, paragraphs, { label: "This is not me — stop it", url }),
    idempotencyKey: `recovery-started:${args.recoveryId}`,
  };
}
