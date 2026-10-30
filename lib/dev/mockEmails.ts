/**
 * Virasat - Sends the emails the mock accounts' state calls for.
 *
 * For each seeded Owner: whatever the check-in ladder says is due (gentle,
 * urgent or final reminders; release notices to Beneficiaries once
 * released), and the invitation to any Trusted Friend who has not accepted.
 * The same code paths the server uses (lib/email/dispatch.ts, the
 * invitation in app/api/trusted-friends), through the configured driver,
 * at most once each (the outbox remembers).
 */

import { sendEmail, templateContext, listOutbox } from "../email";
import { dispatchDueEmails } from "../email/dispatch";
import { trustedFriendInvite } from "../email/templates";
import { vaultFor } from "../state/mockDatabase";
import type { SeededAccount } from "./mockDb";

export interface SentRow {
  owner: string;
  to: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

export async function sendMockEmails(accounts: SeededAccount[]): Promise<SentRow[]> {
  const rows: SentRow[] = [];
  for (const a of accounts) {
    const before = listOutbox().length;
    const vault = vaultFor(a.userId);
    await dispatchDueEmails(vault, { name: a.name, email: a.email });

    for (const f of vault.getTrustedFriends().filter((x) => x.status !== "Accepted")) {
      await sendEmail(
        trustedFriendInvite(templateContext(), {
          friendName: f.name,
          friendEmail: f.email,
          ownerName: a.name,
          inviteToken: f.inviteToken,
        })
      );
    }

    // The outbox is newest first; report this owner's in the order sent.
    for (const e of listOutbox().slice(0, listOutbox().length - before).reverse()) {
      rows.push({ owner: a.email, to: e.to, subject: e.subject, status: e.status, ...(e.error ? { error: e.error } : {}) });
    }
  }
  return rows;
}
