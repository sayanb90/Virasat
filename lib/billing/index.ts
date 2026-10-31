/**
 * Virasat - Billing.
 *
 * Driver is chosen by environment, defaulting to `stub`: a deployment that
 * has not been configured moves no money rather than half-configuring itself
 * against a live provider.
 *
 * Configuration:
 *   BILLING_DRIVER            stub (default) | razorpay
 *   RAZORPAY_KEY_ID           when BILLING_DRIVER=razorpay
 *   RAZORPAY_KEY_SECRET       when BILLING_DRIVER=razorpay
 *   RAZORPAY_WEBHOOK_SECRET   set separately in the Razorpay dashboard
 *   STUB_WEBHOOK_SECRET       optional, for the stub driver's own signatures
 *
 * Nothing here reads a price or a plan. Tiers are a product decision that is
 * not yet made, and guessing one in code would make it the default by
 * accident.
 */

import { createRazorpayDriver } from "./drivers/razorpay";
import { createStubDriver } from "./drivers/stub";
import { alreadyApplied, record } from "./ledger";
import type { BillingDriver, BillingEvent, BillingResult } from "./types";

export function resolveDriver(): BillingDriver {
  switch ((process.env.BILLING_DRIVER ?? "stub").toLowerCase()) {
    case "razorpay":
      return createRazorpayDriver({
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
      });
    case "stub":
      return createStubDriver(process.env.STUB_WEBHOOK_SECRET);
    default:
      // An unrecognised driver is a configuration mistake. Falling back to
      // the stub would hide it, and hiding it means a deployment that
      // silently takes no money.
      return {
        name: `unknown:${process.env.BILLING_DRIVER}`,
        ready: false,
        notReadyReason: `BILLING_DRIVER="${process.env.BILLING_DRIVER}" is not a driver. Use stub or razorpay.`,
        async createCheckout() {
          return { ok: false, error: "No billing driver configured." };
        },
        async createSubscription() {
          return { ok: false, error: "No billing driver configured." };
        },
        async fetchSubscription() {
          return { ok: false, error: "No billing driver configured." };
        },
        async cancelSubscription() {
          return { ok: false, error: "No billing driver configured." };
        },
        verifyWebhook() {
          return { ok: false, error: "No billing driver configured." };
        },
      };
  }
}

export interface BillingStatus {
  driver: string;
  ready: boolean;
  reason?: string;
}

/** Reports configuration shape. Never a key, not even a prefix. */
export function billingStatus(): BillingStatus {
  const driver = resolveDriver();
  return { driver: driver.name, ready: driver.ready, reason: driver.notReadyReason };
}

export type WebhookOutcome =
  | { ok: true; event: BillingEvent; replayed: boolean }
  | { ok: false; status: number; error: string };

/**
 * Verifies and de-duplicates an incoming webhook.
 *
 * Returns a status so the route can answer correctly: a bad signature is 401
 * and must not be retried, while anything we failed to process should be
 * retried and therefore must not be 2xx.
 *
 * Applying the event to an account is deliberately NOT done here. What a
 * payment or a lapse means for entitlement depends on liveness as well as
 * billing, and that model is still being settled — see
 * the Release plan page (Notion).
 */
export function handleWebhook(rawBody: string, headers: Headers): WebhookOutcome {
  const driver = resolveDriver();

  if (!driver.ready) {
    return { ok: false, status: 503, error: driver.notReadyReason ?? "Billing is not configured." };
  }

  const verified: BillingResult<BillingEvent> = driver.verifyWebhook(rawBody, headers);
  if (!verified.ok || !verified.data) {
    record({
      eventId: `unverified-${Date.now()}`,
      type: "unknown",
      outcome: "rejected",
      detail: verified.error,
      at: new Date().toISOString(),
    });
    return { ok: false, status: 401, error: verified.error ?? "Webhook did not verify." };
  }

  const event = verified.data;

  if (alreadyApplied(event.id)) {
    record({
      eventId: event.id,
      type: event.type,
      reference: event.reference,
      outcome: "replayed",
      at: new Date().toISOString(),
    });
    return { ok: true, event, replayed: true };
  }

  record({
    eventId: event.id,
    type: event.type,
    reference: event.reference,
    outcome: "applied",
    at: new Date().toISOString(),
  });
  return { ok: true, event, replayed: false };
}

export { listLedger, resetLedger, alreadyApplied } from "./ledger";
export type { BillingDriver, BillingEvent, Money, PlanRef } from "./types";
