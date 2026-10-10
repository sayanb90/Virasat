/**
 * Virasat - Heartbeat & Safety State Machine (1-Year Cycle)
 * Manages the automated 12-month lifecycle per user:
 * Phase 0: Month 0 -> 9   | Silent Period (Zero communications)
 * Phase 1: Month 9 -> 11  | Gentle Reminders (5 Emails, spaced 12-14 days apart)
 * Phase 2: Month 11 -> 11.5| Escalation (5 Emails, spaced 3-4 days apart)
 * Phase 3: Month 11.5 -> 12| Critical Countdown (10 Daily Emails + SMS/WhatsApp)
 * Trigger: Month 12+      | Chest Key Envelopes released to Beneficiaries
 */

export type EscalationPhase = 0 | 1 | 2 | 3 | 4; // 4 = Triggered / Release

export interface PhaseInfo {
  phase: EscalationPhase;
  name: string;
  description: string;
  badgeColor: string;
  badgeBg: string;
  daysRemaining: number;
  totalDaysInCycle: number;
  activeRemindersCount: number;
  expectedEmailsInPhase: number;
  isTriggered: boolean;
}

export interface EscalationNotification {
  id: string;
  phase: EscalationPhase;
  phaseName: string;
  title: string;
  channel: "Email" | "SMS" | "WhatsApp";
  recipient: string;
  sentAtSimulatedDay: number;
  timestamp: string;
  status: "Sent" | "Delivered" | "Simulated";
  previewText: string;
}

const TOTAL_CYCLE_DAYS = 365;

/**
 * Phase boundaries as a fraction of the full cycle, taken from the original
 * 365-day design (silence to day 270, gentle reminders to 330, urgent to 345).
 * Keeping them proportional means a user can shorten or lengthen their
 * check-in interval and still get the same shape of escalation.
 */
const PHASE_FRACTIONS = {
  silentEnd: 270 / 365,
  gentleEnd: 330 / 365,
  urgentEnd: 345 / 365,
} as const;

export const CYCLE_OPTIONS = [
  { days: 183, label: "Every 6 months" },
  { days: 365, label: "Once a year" },
  { days: 548, label: "Every 18 months" },
  { days: 730, label: "Every 2 years" },
] as const;

export const DEFAULT_CYCLE_DAYS = TOTAL_CYCLE_DAYS;

/**
 * Vacation mode is capped so it can never quietly switch the product off.
 * Someone who paused indefinitely would never be checked on again and would
 * have no reason to notice, which is the one failure mode that matters here.
 */
export const MAX_VACATION_DAYS = 183;

/**
 * Pausing is offered as durations, not a calendar date. A date picker asks a
 * senior user to do arithmetic against today; "3 months" does not. The cap is
 * structural — the longest option is the limit, so there is nothing to refuse.
 */
export const VACATION_PRESETS = [
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: MAX_VACATION_DAYS, label: "6 months" },
] as const;

export function cycleBoundaries(cycleDays: number = TOTAL_CYCLE_DAYS) {
  return {
    silentEnd: Math.round(cycleDays * PHASE_FRACTIONS.silentEnd),
    gentleEnd: Math.round(cycleDays * PHASE_FRACTIONS.gentleEnd),
    urgentEnd: Math.round(cycleDays * PHASE_FRACTIONS.urgentEnd),
    total: cycleDays,
  };
}

/**
 * Calculates current escalation phase and statistics from elapsed days
 */
export function getPhaseFromElapsedDays(
  elapsedDays: number,
  cycleDays: number = TOTAL_CYCLE_DAYS
): PhaseInfo {
  const bounds = cycleBoundaries(cycleDays);

  if (elapsedDays < bounds.silentEnd) {
    // 0 -> 9 months (approx 270 days)
    return {
      phase: 0,
      name: "Phase 0: Silent Period",
      description: "App operates in complete silence. Zero notifications or intrusive prompts.",
      badgeColor: "text-emerald-400",
      badgeBg: "bg-emerald-500/10 border-emerald-500/20",
      daysRemaining: bounds.silentEnd - elapsedDays,
      totalDaysInCycle: bounds.total,
      activeRemindersCount: 0,
      expectedEmailsInPhase: 0,
      isTriggered: false,
    };
  } else if (elapsedDays < bounds.gentleEnd) {
    // 9 -> 11 months (approx 270 to 330 days on a one-year cycle)
    const phaseDays = elapsedDays - bounds.silentEnd;
    const remindersSent = Math.min(5, Math.floor(phaseDays / 12) + 1);
    return {
      phase: 1,
      name: "Phase 1: Gentle Reminders",
      description: "Gentle heartbeat check-in reminders sent to vault owner spaced 12-14 days apart.",
      badgeColor: "text-sky-400",
      badgeBg: "bg-sky-500/10 border-sky-500/20",
      daysRemaining: bounds.gentleEnd - elapsedDays,
      totalDaysInCycle: bounds.total,
      activeRemindersCount: remindersSent,
      expectedEmailsInPhase: 5,
      isTriggered: false,
    };
  } else if (elapsedDays < bounds.urgentEnd) {
    // 11 -> 11.5 months (approx 330 to 345 days on a one-year cycle)
    const phaseDays = elapsedDays - 330;
    const remindersSent = Math.min(5, Math.floor(phaseDays / 3) + 1);
    return {
      phase: 2,
      name: "Phase 2: Escalation",
      description: "Increased frequency reminders (spaced 3-4 days apart) alerting of pending vault release.",
      badgeColor: "text-amber-400",
      badgeBg: "bg-amber-500/10 border-amber-500/20",
      daysRemaining: bounds.urgentEnd - elapsedDays,
      totalDaysInCycle: bounds.total,
      activeRemindersCount: remindersSent,
      expectedEmailsInPhase: 5,
      isTriggered: false,
    };
  } else if (elapsedDays < bounds.total) {
    // 11.5 -> 12 months (approx 345 to 365 days on a one-year cycle)
    const phaseDays = elapsedDays - bounds.urgentEnd;
    const remindersSent = Math.min(10, phaseDays + 1);
    return {
      phase: 3,
      name: "Phase 3: Critical Countdown",
      description: "Final 2-week daily countdown alerts sent via Email, SMS, and WhatsApp.",
      badgeColor: "text-rose-400",
      badgeBg: "bg-rose-500/10 border-rose-500/20",
      daysRemaining: bounds.total - elapsedDays,
      totalDaysInCycle: bounds.total,
      activeRemindersCount: remindersSent,
      expectedEmailsInPhase: 10,
      isTriggered: false,
    };
  } else {
    // Past the full cycle: Triggered
    return {
      phase: 4,
      name: "Phase 4: Vault Releasing / Escalation Triggered",
      description: "Safety timer expired without check-in. Encrypted chest keys unlocked for beneficiaries.",
      badgeColor: "text-purple-400 animate-pulse",
      badgeBg: "bg-purple-500/20 border-purple-500/40",
      daysRemaining: 0,
      totalDaysInCycle: bounds.total,
      activeRemindersCount: 20,
      expectedEmailsInPhase: 20,
      isTriggered: true,
    };
  }
}

/**
 * Spreads `count` events evenly across a phase, matching the original
 * 365-day design: 5 gentle reminders 12 days apart, 5 urgent alerts 3 days
 * apart, 10 critical alerts 2 days apart. Deriving the spacing from the
 * phase width means a 6-month or 2-year cycle gets the same *shape* of
 * escalation rather than a schedule still pinned to 365 days.
 */
function scheduleWithin(start: number, end: number, count: number): number[] {
  const step = (end - start) / count;
  return Array.from({ length: count }, (_, i) => Math.round(start + i * step));
}

/**
 * Generates notification logs for all events up to simulated elapsed days.
 *
 * `cycleDays` must be the user's configured check-in interval. Passing the
 * default when the user is on a different cycle produces a log that disagrees
 * with the phase badge they can see on screen.
 */
export function generateNotificationsForElapsedDays(
  elapsedDays: number,
  cycleDays: number = TOTAL_CYCLE_DAYS
): EscalationNotification[] {
  const notifications: EscalationNotification[] = [];
  const bounds = cycleBoundaries(cycleDays);
  const timestampFor = (day: number) =>
    new Date(Date.now() - (elapsedDays - day) * 86400000).toLocaleString();
  const daysLeft = (day: number) => bounds.total - day;

  // Phase 1: gentle reminders across the first escalation window (5 emails).
  scheduleWithin(bounds.silentEnd, bounds.gentleEnd, 5).forEach((day, index) => {
    if (elapsedDays >= day) {
      notifications.push({
        id: `notif-p1-${index + 1}`,
        phase: 1,
        phaseName: "Phase 1: Gentle Reminder",
        title: `Virasat Safety Check-In Reminder #${index + 1}`,
        channel: "Email",
        recipient: "owner@virasat.vault",
        sentAtSimulatedDay: day,
        timestamp: timestampFor(day),
        status: "Delivered",
        previewText: `Friendly reminder: Please confirm your safety status on Virasat. Your silent period ends in ${daysLeft(day)} days.`,
      });
    }
  });

  // Phase 2: urgent escalation (5 alerts).
  scheduleWithin(bounds.gentleEnd, bounds.urgentEnd, 5).forEach((day, index) => {
    if (elapsedDays >= day) {
      notifications.push({
        id: `notif-p2-${index + 1}`,
        phase: 2,
        phaseName: "Phase 2: Escalation Notice",
        title: `URGENT: Virasat Safety Escalation #${index + 1}`,
        channel: "Email",
        recipient: "owner@virasat.vault",
        sentAtSimulatedDay: day,
        timestamp: timestampFor(day),
        status: "Delivered",
        previewText: `Action required: Virasat safety escalation activated. Vault payload will be made accessible to designated beneficiaries in ${daysLeft(day)} days.`,
      });
    }
  });

  // Phase 3: critical countdown (10 paired email + SMS alerts).
  scheduleWithin(bounds.urgentEnd, bounds.total, 10).forEach((day, index) => {
    if (elapsedDays < day) return;
    const idx = index + 1;

    notifications.push({
      id: `notif-p3-email-${idx}`,
      phase: 3,
      phaseName: "Phase 3: Critical Countdown",
      title: `CRITICAL COUNTDOWN: ${daysLeft(day)} Days to Vault Release`,
      channel: "Email",
      recipient: "owner@virasat.vault",
      sentAtSimulatedDay: day,
      timestamp: timestampFor(day),
      status: "Delivered",
      previewText: `FINAL WARNING: ${daysLeft(day)} days remaining. Tap 'I AM SAFE & WELL' in Virasat to reset your check-in timer before beneficiary envelopes are released.`,
    });

    notifications.push({
      id: `notif-p3-sms-${idx}`,
      phase: 3,
      phaseName: "Phase 3: Critical Countdown",
      title: `SMS Alert: ${daysLeft(day)} Days Remaining`,
      channel: "SMS",
      recipient: "+1 (555) 019-8293",
      sentAtSimulatedDay: day,
      timestamp: timestampFor(day),
      status: "Delivered",
      previewText: `[Virasat] Critical Safety Alert: ${daysLeft(day)} days until digital vault release. Open app to confirm safety.`,
    });
  });

  // Phase 4: release trigger.
  if (elapsedDays >= bounds.total) {
    notifications.push({
      id: "notif-p4-release",
      phase: 4,
      phaseName: "Phase 4: Vault Release",
      title: "DIGITAL ESTATE RELEASED: Beneficiary Envelopes Unlocked",
      channel: "Email",
      recipient: "beneficiaries@virasat.vault",
      sentAtSimulatedDay: bounds.total,
      timestamp: new Date().toLocaleString(),
      status: "Delivered",
      previewText:
        "Notice of Digital Estate Release: The safety protocol has expired without check-in. Designated beneficiaries may now claim their encrypted chest keys.",
    });
  }

  return notifications;
}
