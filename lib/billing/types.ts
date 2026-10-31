/**
 * Virasat - Billing transport contract.
 *
 * Provider-agnostic on purpose, the same way lib/email is. The app asks for
 * a checkout or a subscription; a driver talks to whoever actually moves the
 * money. Swapping Razorpay for a Merchant of Record later must not touch a
 * caller.
 *
 * Two rules this module exists to hold:
 *
 *   1. **Entitlement is decided by webhooks, never by the browser.** A client
 *      saying "payment succeeded" is a claim, not a fact. Only a
 *      signature-verified webhook changes what someone is entitled to.
 *   2. **No card data ever reaches this app.** We hold provider identifiers
 *      and nothing else. The vault's zero-knowledge posture must not acquire
 *      a billing hole.
 */

/** Minor units — paise, cents. Never a float; money in floats is a bug. */
export interface Money {
  /** e.g. 99900 for ₹999.00 */
  amount: number;
  /** ISO 4217, upper case. "INR", "USD". */
  currency: string;
}

/**
 * A plan as the provider knows it. Deliberately thin: tiers, prices and
 * entitlements are a product decision that is not yet made, so this carries
 * only the provider's own identifier.
 */
export interface PlanRef {
  /** The provider's plan id, e.g. Razorpay's "plan_xxx". */
  providerPlanId: string;
}

export interface CheckoutRequest {
  money: Money;
  /** Our own reference, echoed back on the webhook so we can reconcile. */
  reference: string;
  /** Shown by the provider's own checkout UI. */
  description?: string;
  customerEmail?: string;
}

export interface CheckoutSession {
  /** The provider's order/session id the client hands to its checkout. */
  providerOrderId: string;
  money: Money;
  /** Public key id the browser needs. Never the secret. */
  publicKey?: string;
}

export interface SubscriptionRequest {
  plan: PlanRef;
  /** Our own reference, echoed back on webhooks. */
  reference: string;
  customerEmail?: string;
  /** How many billing cycles before the mandate must be renewed. */
  totalCycles?: number;
  /**
   * Epoch seconds. Lets a lifetime purchase or a prepaid term start billing
   * only when the paid-for period ends.
   */
  startAt?: number;
}

export interface SubscriptionRef {
  providerSubscriptionId: string;
  status: string;
  /** Where the customer completes mandate authorisation (AFA/OTP/UPI PIN). */
  authorisationUrl?: string;
}

/**
 * A provider event, already signature-verified, normalised just enough to
 * route on. `raw` is kept because reconciliation and support questions need
 * the provider's own words.
 */
export interface BillingEvent {
  /** Provider's event id where it gives one; otherwise derived. */
  id: string;
  /** Provider's own event name, e.g. "subscription.charged". */
  type: string;
  /** Our reference, when the provider echoed one back. */
  reference?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  money?: Money;
  /**
   * Why a payment failed, where the provider says. Not decoration: "card
   * expired" and "account frozen" mean very different things about whether
   * the account holder is alive. See the Release plan page (Notion).
   */
  failureReason?: string;
  raw: unknown;
}

export interface BillingResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface BillingDriver {
  readonly name: string;
  /** True when the driver has credentials. False degrades loudly, not silently. */
  readonly ready: boolean;
  readonly notReadyReason?: string;

  createCheckout(req: CheckoutRequest): Promise<BillingResult<CheckoutSession>>;
  createSubscription(req: SubscriptionRequest): Promise<BillingResult<SubscriptionRef>>;
  fetchSubscription(id: string): Promise<BillingResult<SubscriptionRef>>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<BillingResult<SubscriptionRef>>;

  /**
   * Verifies a webhook against the RAW request body and returns the event.
   *
   * Takes the raw string, never a parsed object: re-serialising parsed JSON
   * produces different bytes from what the provider signed, which is the most
   * common way webhook verification is silently broken.
   */
  verifyWebhook(rawBody: string, headers: Headers): BillingResult<BillingEvent>;
}
