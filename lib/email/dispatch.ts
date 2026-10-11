/**
 * Virasat - Turning escalation state into actual email.
 *
 * The ladder is a pure function of elapsed days, recomputed on every read.
 * This module is the only place that decides a computed notification should
 * become a real message, and it leans entirely on the outbox ledger for
 * "have we already done this" — so calling it repeatedly is safe and is in
 * fact the expected pattern.
 */

import { db } from "@/lib/state/mockDatabase";
import {
  getPhaseFromElapsedDays,
  generateNotificationsForElapsedDays,
} from "@/lib/state/heartbeatMachine";
import { sendEmail, templateContext } from "./index";
import { safetyCheckIn, beneficiaryRelease, type LadderTone } from "./templates";

/** The owner's own details. Hardcoded until there are real accounts. */
const OWNER = {
  name: process.env.OWNER_NAME ?? "there",
  email: process.env.OWNER_EMAIL ?? "",
};

function toneFor(phase: number): LadderTone | null {
  if (phase === 1) return "gentle";
  if (phase === 2) return "urgent";
  if (phase === 3) return "critical";
  return null;
}

export interface DispatchSummary {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const EMPTY: DispatchSummary = { attempted: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

/**
 * Sends anything the current escalation state says is due and has not already
 * gone out. Safe to call on every heartbeat read.
 *
 * Returns a summary rather than throwing: `/api/heartbeat` is how a user says
 * "I am alive", and an email provider being down must never stop that.
 */
export async function dispatchDueEmails(): Promise<DispatchSummary> {
  // A paused account is paused: no ladder, no release, nothing sent.
  if (db.isOnVacation()) return { ...EMPTY };

  const { checkInCycleDays } = db.getSettings();
  const elapsed = db.simulatedElapsedDays;
  const ctx = templateContext();
  const summary: DispatchSummary = { attempted: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  const tally = (r: { ok: boolean; skipped?: boolean; error?: string }) => {
    summary.attempted += 1;
    if (r.skipped) summary.skipped += 1;
    else if (r.ok) summary.sent += 1;
    else {
      summary.failed += 1;
      if (r.error) summary.errors.push(r.error);
    }
  };

  const phaseInfo = getPhaseFromElapsedDays(elapsed, checkInCycleDays);
  const due = generateNotificationsForElapsedDays(elapsed, checkInCycleDays);

  /* --- The ladder, to the owner ------------------------------------- */
  if (OWNER.email) {
    // One email per ladder step. SMS and WhatsApp rows are skipped: this
    // module only does email, and a channel we cannot send is not an error.
    for (const n of due.filter((n) => n.channel === "Email" && n.phase >= 1 && n.phase <= 3)) {
      const tone = toneFor(n.phase);
      if (!tone) continue;
      tally(
        await sendEmail(
          safetyCheckIn(ctx, {
            ownerName: OWNER.name,
            ownerEmail: OWNER.email,
            tone,
            daysUntilRelease: Math.max(0, checkInCycleDays - n.sentAtSimulatedDay),
            notificationId: n.id,
          })
        )
      );
    }
  }

  /* --- Release, to each beneficiary --------------------------------- */
  if (phaseInfo.isTriggered) {
    const notes = db.getVaultItems();
    for (const b of db.getBeneficiaries()) {
      if (!b.email) continue;
      // Only notes actually addressed to this person, falling back to all of
      // them when the owner never assigned any — which matches what /claim
      // currently shows.
      const theirs = notes.filter(
        (n) => n.assignedBeneficiaryIds.length === 0 || n.assignedBeneficiaryIds.includes(b.id)
      );
      if (theirs.length === 0) continue;

      tally(
        await sendEmail(
          beneficiaryRelease(ctx, {
            beneficiaryName: b.name,
            beneficiaryEmail: b.email,
            ownerName: OWNER.name,
            noteCount: theirs.length,
            // Keyed on the beneficiary and the cycle, so one release produces
            // exactly one notice per person however often this is called.
            releaseId: `${b.id}:${checkInCycleDays}`,
          })
        )
      );
    }
  }

  if (summary.sent > 0) {
    db.logAudit(
      "Escalation Email Dispatched",
      "Escalation",
      `Sent ${summary.sent} email(s) for Day ${elapsed} of a ${checkInCycleDays}-day cycle.` +
        (summary.failed > 0 ? ` ${summary.failed} failed.` : "")
    );
  }

  return summary;
}
