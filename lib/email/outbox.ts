/**
 * Virasat - Send ledger.
 *
 * Two jobs:
 *
 * 1. **Stop duplicates.** The escalation ladder is recomputed from elapsed
 *    days on every read of `/api/heartbeat`, so a naive "send what the ladder
 *    says" would post the whole ladder again on every page load. Each message
 *    carries an `idempotencyKey`; a key already in this ledger is never sent
 *    twice.
 *
 * 2. **Make sends visible.** What left the building, and what failed, is
 *    shown in the security log and asserted by tests.
 *
 * In-memory, like the rest of this build's state. When persistence lands this
 * is the first thing that must move with it: a ledger that empties on restart
 * means a restart mid-ladder re-sends everything, which for this product
 * means re-sending a release notice to a grieving family. The interface is
 * narrow on purpose so that move is a small change.
 */

export interface OutboxEntry {
  idempotencyKey: string;
  to: string;
  subject: string;
  driver: string;
  status: "sent" | "failed";
  providerId?: string;
  error?: string;
  at: string;
}

const entries: OutboxEntry[] = [];
const seen = new Set<string>();

/** True when this exact message has already been handed to a driver. */
export function alreadySent(idempotencyKey: string): boolean {
  return seen.has(idempotencyKey);
}

export function record(entry: OutboxEntry): void {
  // Only a success closes the key. A failed send stays retryable, otherwise a
  // provider outage would permanently swallow a release notice.
  if (entry.status === "sent") seen.add(entry.idempotencyKey);
  entries.unshift(entry);
}

export function listOutbox(): OutboxEntry[] {
  return [...entries];
}

/** Called by the gated test-reset route so specs do not leak into each other. */
export function resetOutbox(): void {
  entries.length = 0;
  seen.clear();
}
