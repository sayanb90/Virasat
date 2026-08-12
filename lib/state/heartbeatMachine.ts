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
 * Calculates current escalation phase and statistics from elapsed days
 */
export function getPhaseFromElapsedDays(elapsedDays: number): PhaseInfo {
  if (elapsedDays < 270) {
    // 0 -> 9 months (approx 270 days)
    return {
      phase: 0,
      name: "Phase 0: Silent Period",
      description: "App operates in complete silence. Zero notifications or intrusive prompts.",
      badgeColor: "text-emerald-400",
      badgeBg: "bg-emerald-500/10 border-emerald-500/20",
      daysRemaining: 270 - elapsedDays,
      totalDaysInCycle: TOTAL_CYCLE_DAYS,
      activeRemindersCount: 0,
      expectedEmailsInPhase: 0,
      isTriggered: false,
    };
  } else if (elapsedDays < 330) {
    // 9 -> 11 months (approx 270 to 330 days)
    const phaseDays = elapsedDays - 270;
    const remindersSent = Math.min(5, Math.floor(phaseDays / 12) + 1);
    return {
      phase: 1,
      name: "Phase 1: Gentle Reminders",
      description: "Gentle heartbeat check-in reminders sent to vault owner spaced 12-14 days apart.",
      badgeColor: "text-sky-400",
      badgeBg: "bg-sky-500/10 border-sky-500/20",
      daysRemaining: 330 - elapsedDays,
      totalDaysInCycle: TOTAL_CYCLE_DAYS,
      activeRemindersCount: remindersSent,
      expectedEmailsInPhase: 5,
      isTriggered: false,
    };
  } else if (elapsedDays < 345) {
    // 11 -> 11.5 months (approx 330 to 345 days)
    const phaseDays = elapsedDays - 330;
    const remindersSent = Math.min(5, Math.floor(phaseDays / 3) + 1);
    return {
      phase: 2,
      name: "Phase 2: Escalation",
      description: "Increased frequency reminders (spaced 3-4 days apart) alerting of pending vault release.",
      badgeColor: "text-amber-400",
      badgeBg: "bg-amber-500/10 border-amber-500/20",
      daysRemaining: 345 - elapsedDays,
      totalDaysInCycle: TOTAL_CYCLE_DAYS,
      activeRemindersCount: remindersSent,
      expectedEmailsInPhase: 5,
      isTriggered: false,
    };
  } else if (elapsedDays < 365) {
    // 11.5 -> 12 months (approx 345 to 365 days)
    const phaseDays = elapsedDays - 345;
    const remindersSent = Math.min(10, phaseDays + 1);
    return {
      phase: 3,
      name: "Phase 3: Critical Countdown",
      description: "Final 2-week daily countdown alerts sent via Email, SMS, and WhatsApp.",
      badgeColor: "text-rose-400",
      badgeBg: "bg-rose-500/10 border-rose-500/20",
      daysRemaining: 365 - elapsedDays,
      totalDaysInCycle: TOTAL_CYCLE_DAYS,
      activeRemindersCount: remindersSent,
      expectedEmailsInPhase: 10,
      isTriggered: false,
    };
  } else {
    // 365+ days: Triggered
    return {
      phase: 4,
      name: "Phase 4: Vault Releasing / Escalation Triggered",
      description: "Safety timer expired without check-in. Encrypted chest keys unlocked for beneficiaries.",
      badgeColor: "text-purple-400 animate-pulse",
      badgeBg: "bg-purple-500/20 border-purple-500/40",
      daysRemaining: 0,
      totalDaysInCycle: TOTAL_CYCLE_DAYS,
      activeRemindersCount: 20,
      expectedEmailsInPhase: 20,
      isTriggered: true,
    };
  }
}

/**
 * Generates notification logs for all events up to simulated elapsed days
 */
export function generateNotificationsForElapsedDays(elapsedDays: number): EscalationNotification[] {
  const notifications: EscalationNotification[] = [];

  // Phase 1: Days 270 to 330 (5 emails)
  const phase1Intervals = [270, 282, 294, 306, 318];
  phase1Intervals.forEach((day, index) => {
    if (elapsedDays >= day) {
      notifications.push({
        id: `notif-p1-${index + 1}`,
        phase: 1,
        phaseName: "Phase 1: Gentle Reminder",
        title: `Virasat Safety Check-In Reminder #${index + 1}`,
        channel: "Email",
        recipient: "owner@virasat.vault",
        sentAtSimulatedDay: day,
        timestamp: new Date(Date.now() - (elapsedDays - day) * 86400000).toLocaleString(),
        status: "Delivered",
        previewText: `Friendly reminder: Please confirm your safety status on Virasat. Your silent period ends in ${365 - day} days.`,
      });
    }
  });

  // Phase 2: Days 330 to 345 (5 emails)
  const phase2Intervals = [330, 333, 336, 339, 342];
  phase2Intervals.forEach((day, index) => {
    if (elapsedDays >= day) {
      notifications.push({
        id: `notif-p2-${index + 1}`,
        phase: 2,
        phaseName: "Phase 2: Escalation Notice",
        title: `URGENT: Virasat Safety Escalation #${index + 1}`,
        channel: "Email",
        recipient: "owner@virasat.vault",
        sentAtSimulatedDay: day,
        timestamp: new Date(Date.now() - (elapsedDays - day) * 86400000).toLocaleString(),
        status: "Delivered",
        previewText: `Action required: Virasat safety escalation activated. Vault payload will be made accessible to designated beneficiaries in ${365 - day} days.`,
      });
    }
  });

  // Phase 3: Days 345 to 365 (10 daily emails + SMS)
  for (let day = 345; day < 365; day += 2) {
    if (elapsedDays >= day) {
      const idx = Math.floor((day - 345) / 2) + 1;
      notifications.push({
        id: `notif-p3-email-${idx}`,
        phase: 3,
        phaseName: "Phase 3: Critical Countdown",
        title: `CRITICAL COUNTDOWN: ${365 - day} Days to Vault Release`,
        channel: "Email",
        recipient: "owner@virasat.vault",
        sentAtSimulatedDay: day,
        timestamp: new Date(Date.now() - (elapsedDays - day) * 86400000).toLocaleString(),
        status: "Delivered",
        previewText: `FINAL WARNING: ${365 - day} days remaining. Tap 'I AM SAFE & WELL' in Virasat to reset your 1-year timer before beneficiary envelopes are released.`,
      });

      notifications.push({
        id: `notif-p3-sms-${idx}`,
        phase: 3,
        phaseName: "Phase 3: Critical Countdown",
        title: `SMS Alert: ${365 - day} Days Remaining`,
        channel: "SMS",
        recipient: "+1 (555) 019-8293",
        sentAtSimulatedDay: day,
        timestamp: new Date(Date.now() - (elapsedDays - day) * 86400000).toLocaleString(),
        status: "Delivered",
        previewText: `[Virasat] Critical Safety Alert: ${365 - day} days until digital vault release. Open app to confirm safety.`,
      });
    }
  }

  // Phase 4: Release Trigger
  if (elapsedDays >= 365) {
    notifications.push({
      id: "notif-p4-release",
      phase: 4,
      phaseName: "Phase 4: Vault Release",
      title: "DIGITAL ESTATE RELEASED: Beneficiary Envelopes Unlocked",
      channel: "Email",
      recipient: "beneficiaries@virasat.vault",
      sentAtSimulatedDay: 365,
      timestamp: new Date().toLocaleString(),
      status: "Delivered",
      previewText: "Notice of Digital Estate Release: The 1-year safety protocol has expired without check-in. Designated beneficiaries may now claim their encrypted chest keys.",
    });
  }

  return notifications;
}
