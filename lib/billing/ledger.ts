/**
 * Virasat - Processed-webhook ledger.
 *
 * Providers retry. A delivery that times out on our side is sent again, and
 * the same `subscription.charged` arriving twice must not extend a
 * subscription twice or credit a payment twice. Every event is recorded by
 * its provider event id and replays are refused.
 *
 * This is the same lesson as lib/email/outbox, in the direction that costs
 * money rather than sends mail.
 *
 * In-memory, like the rest of this build's state. It must move to the
 * database alongside everything else: a ledger that empties on restart means
 * a restart mid-retry double-applies whatever arrives next.
 */

export interface LedgerEntry {
  eventId: string;
  type: string;
  reference?: string;
  outcome: "applied" | "replayed" | "rejected";
  detail?: string;
  at: string;
}

// On globalThis: see lib/state/mockDatabase.ts.
const g = globalThis as { __virasatLedger?: { entries: LedgerEntry[]; applied: Set<string> } };
const { entries, applied } = (g.__virasatLedger ??= { entries: [], applied: new Set<string>() });

export function alreadyApplied(eventId: string): boolean {
  return applied.has(eventId);
}

export function record(entry: LedgerEntry): void {
  // Only a successful application closes the id. A rejected event stays open
  // so a genuine retry after a transient fault is still processed.
  if (entry.outcome === "applied") applied.add(entry.eventId);
  entries.unshift(entry);
}

export function listLedger(): LedgerEntry[] {
  return [...entries];
}

/** Called by the gated test-reset route so specs do not leak into each other. */
export function resetLedger(): void {
  entries.length = 0;
  applied.clear();
}

export interface LedgerSnapshot {
  entries: LedgerEntry[];
  applied: string[];
}

export function snapshotLedger(): LedgerSnapshot {
  return { entries: [...entries], applied: [...applied] };
}

export function restoreLedger(snap: LedgerSnapshot): void {
  resetLedger();
  entries.push(...snap.entries);
  for (const id of snap.applied) applied.add(id);
}
