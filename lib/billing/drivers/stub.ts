import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  BillingDriver,
  BillingResult,
  CheckoutRequest,
  CheckoutSession,
  SubscriptionRef,
  SubscriptionRequest,
} from "../types";

/**
 * The development and test driver. Moves no money, talks to nobody.
 *
 * It is the default on purpose: a half-configured deployment must not post a
 * real customer to a real provider, and the specs need to exercise the whole
 * flow without credentials or a network.
 *
 * It still verifies webhook signatures, using STUB_WEBHOOK_SECRET. A stub
 * that waved signatures through would let a verification bug reach
 * production untested — the one thing in this module that must never be
 * weakened for convenience.
 */
export function createStubDriver(webhookSecret = "stub-webhook-secret"): BillingDriver {
  return {
    name: "stub",
    ready: true,

    async createCheckout(req: CheckoutRequest): Promise<BillingResult<CheckoutSession>> {
      return {
        ok: true,
        data: {
          providerOrderId: `order_stub_${randomBytes(8).toString("hex")}`,
          money: req.money,
          publicKey: "key_stub",
        },
      };
    },

    async createSubscription(req: SubscriptionRequest): Promise<BillingResult<SubscriptionRef>> {
      return {
        ok: true,
        data: {
          providerSubscriptionId: `sub_stub_${randomBytes(8).toString("hex")}`,
          status: "created",
          authorisationUrl: `https://example.invalid/authorise/${encodeURIComponent(req.reference)}`,
        },
      };
    },

    async fetchSubscription(id: string): Promise<BillingResult<SubscriptionRef>> {
      return { ok: true, data: { providerSubscriptionId: id, status: "active" } };
    },

    async cancelSubscription(id: string): Promise<BillingResult<SubscriptionRef>> {
      return { ok: true, data: { providerSubscriptionId: id, status: "cancelled" } };
    },

    verifyWebhook(rawBody: string, headers: Headers) {
      const signature = headers.get("x-stub-signature");
      const expected = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(signature ?? "", "hex");
      if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, error: "Webhook signature did not verify." };
      }

      try {
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        const type = typeof parsed.event === "string" ? parsed.event : undefined;
        if (!type) return { ok: false, error: "Webhook body has no event type." };
        return {
          ok: true,
          data: {
            id: typeof parsed.id === "string" ? parsed.id : `${type}:stub`,
            type,
            reference: typeof parsed.reference === "string" ? parsed.reference : undefined,
            raw: parsed,
          },
        };
      } catch {
        return { ok: false, error: "Webhook body is not valid JSON." };
      }
    },
  };
}
