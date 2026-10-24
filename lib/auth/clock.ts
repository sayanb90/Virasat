/**
 * The time sign-in decisions are made against.
 *
 * Holds and expiries (the 72-hour recovery hold, five-minute pending
 * sessions) cannot be tested by waiting. The offset is moved only by the
 * VIRASAT_E2E-gated test route and by the Cucumber steps; nothing else
 * touches it.
 */

let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

export function nowMs(): number {
  return Date.now() + offsetMs;
}

export function advanceClockForTesting(ms: number): void {
  offsetMs += ms;
}

export function resetClockForTesting(): void {
  offsetMs = 0;
}
