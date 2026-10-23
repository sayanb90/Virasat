import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingDriver,
  BillingEvent,
  BillingResult,
  CheckoutRequest,
  CheckoutSession,
  SubscriptionRef,
  SubscriptionRequest,
} from "../types";

const API = "https://api.razorpay.com/v1";

export interface RazorpayConfig {
  keyId?: string;
  keySecret?: string;
  /** Set separately in the Razorpay dashboard. NOT the API key secret. */
  webhookSecret?: string;
}

/**
 * Timing-safe comparison of two hex digests.
 *
 * A plain `===` on a signature leaks, through response timing, how many
 * leading bytes a guess got right. Lengths are compared first because
 * timingSafeEqual throws on a mismatch.
 */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verifies a Razorpay webhook: HMAC-SHA256 over the raw body, keyed with the
 * dashboard webhook secret, hex, in X-Razorpay-Signature.
 *
 * Exported so it can be tested directly against known vectors without a
 * network or a configured driver.
 */
export function razorpaySignatureIsValid(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
  return safeEqualHex(expected, signature);
}

/**
 * Verifies a completed checkout handed back by the browser.
 *
 * Razorpay signs `order_id|payment_id` with the API key secret. This is the
 * only client-supplied payment claim worth looking at, and even then it is a
 * convenience for redirecting the user — the webhook remains the thing that
 * changes entitlement.
 */
export function razorpayCheckoutSignatureIsValid(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`, "utf8")
    .digest("hex");
  return safeEqualHex(expected, signature);
}

type RazorpayEntity = Record<string, unknown>;

function asRecord(v: unknown): RazorpayEntity | undefined {
  return v && typeof v === "object" ? (v as RazorpayEntity) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Pulls our own reference back out of Razorpay's notes bag. */
function referenceFrom(entity: RazorpayEntity | undefined): string | undefined {
  const notes = asRecord(entity?.notes);
  return str(notes?.virasat_reference);
}

export function createRazorpayDriver(config: RazorpayConfig): BillingDriver {
  const { keyId, keySecret, webhookSecret } = config;
  const missing: string[] = [];
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");
  if (!webhookSecret) missing.push("RAZORPAY_WEBHOOK_SECRET");

  const auth =
    keyId && keySecret ? `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` : "";

  async function call<T>(
    path: string,
    init?: { method?: string; body?: unknown }
  ): Promise<BillingResult<T>> {
    if (!auth) return { ok: false, error: `Razorpay is not configured: ${missing.join(", ")}.` };
    try {
      const res = await fetch(`${API}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const err = asRecord(asRecord(data)?.error);
        return { ok: false, error: str(err?.description) ?? `Razorpay returned ${res.status}.` };
      }
      return { ok: true, data: data as T };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Request to Razorpay failed.",
      };
    }
  }

  return {
    name: "razorpay",
    ready: missing.length === 0,
    notReadyReason: missing.length ? `Not set: ${missing.join(", ")}.` : undefined,

    async createCheckout(req: CheckoutRequest) {
      const result = await call<RazorpayEntity>("/orders", {
        method: "POST",
        body: {
          amount: req.money.amount,
          currency: req.money.currency,
          // Razorpay's own idempotency handle: the same receipt will not
          // create a second order.
          receipt: req.reference,
          notes: { virasat_reference: req.reference },
        },
      });
      if (!result.ok || !result.data) return { ok: false, error: result.error };

      const id = str(result.data.id);
      if (!id) return { ok: false, error: "Razorpay returned an order with no id." };

      return {
        ok: true,
        data: {
          providerOrderId: id,
          money: req.money,
          // The key id is public by design — the browser checkout needs it.
          // The secret never leaves the server.
          publicKey: keyId,
        } satisfies CheckoutSession,
      };
    },

    async createSubscription(req: SubscriptionRequest) {
      const result = await call<RazorpayEntity>("/subscriptions", {
        method: "POST",
        body: {
          plan_id: req.plan.providerPlanId,
          customer_notify: 1,
          ...(req.totalCycles ? { total_count: req.totalCycles } : {}),
          ...(req.startAt ? { start_at: req.startAt } : {}),
          notes: { virasat_reference: req.reference },
        },
      });
      if (!result.ok || !result.data) return { ok: false, error: result.error };

      const id = str(result.data.id);
      if (!id) return { ok: false, error: "Razorpay returned a subscription with no id." };

      return {
        ok: true,
        data: {
          providerSubscriptionId: id,
          status: str(result.data.status) ?? "created",
          authorisationUrl: str(result.data.short_url),
        } satisfies SubscriptionRef,
      };
    },

    async fetchSubscription(id: string) {
      const result = await call<RazorpayEntity>(`/subscriptions/${encodeURIComponent(id)}`);
      if (!result.ok || !result.data) return { ok: false, error: result.error };
      return {
        ok: true,
        data: {
          providerSubscriptionId: str(result.data.id) ?? id,
          status: str(result.data.status) ?? "unknown",
          authorisationUrl: str(result.data.short_url),
        } satisfies SubscriptionRef,
      };
    },

    async cancelSubscription(id: string, atCycleEnd: boolean) {
      const result = await call<RazorpayEntity>(
        `/subscriptions/${encodeURIComponent(id)}/cancel`,
        { method: "POST", body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } }
      );
      if (!result.ok || !result.data) return { ok: false, error: result.error };
      return {
        ok: true,
        data: {
          providerSubscriptionId: str(result.data.id) ?? id,
          status: str(result.data.status) ?? "cancelled",
        } satisfies SubscriptionRef,
      };
    },

    verifyWebhook(rawBody: string, headers: Headers) {
      if (!webhookSecret) {
        return { ok: false, error: "RAZORPAY_WEBHOOK_SECRET is not set." };
      }
      if (!razorpaySignatureIsValid(rawBody, headers.get("x-razorpay-signature"), webhookSecret)) {
        return { ok: false, error: "Webhook signature did not verify." };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return { ok: false, error: "Webhook body is not valid JSON." };
      }

      const body = asRecord(parsed);
      const type = str(body?.event);
      if (!type) return { ok: false, error: "Webhook body has no event type." };

      const payload = asRecord(body?.payload);
      const payment = asRecord(asRecord(payload?.payment)?.entity);
      const subscription = asRecord(asRecord(payload?.subscription)?.entity);
      const order = asRecord(asRecord(payload?.order)?.entity);

      const amount = payment?.amount ?? order?.amount;
      const currency = str(payment?.currency) ?? str(order?.currency);

      return {
        ok: true,
        data: {
          // Razorpay does not always send an event id, so fall back to
          // something stable for the same delivery rather than something
          // random, which would defeat replay suppression.
          id:
            headers.get("x-razorpay-event-id") ??
            `${type}:${str(payment?.id) ?? str(subscription?.id) ?? str(order?.id) ?? "unknown"}`,
          type,
          reference: referenceFrom(payment) ?? referenceFrom(subscription) ?? referenceFrom(order),
          providerOrderId: str(payment?.order_id) ?? str(order?.id),
          providerPaymentId: str(payment?.id),
          providerSubscriptionId: str(subscription?.id),
          ...(typeof amount === "number" && currency
            ? { money: { amount, currency } }
            : {}),
          failureReason:
            str(payment?.error_reason) ??
            str(payment?.error_description) ??
            str(payment?.error_code),
          raw: parsed,
        } satisfies BillingEvent,
      };
    },
  };
}
