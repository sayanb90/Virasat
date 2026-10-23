import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { createHmac } from "node:crypto";

import { razorpaySignatureIsValid, createRazorpayDriver } from "../../lib/billing/drivers/razorpay";
import { billingStatus, handleWebhook, type WebhookOutcome } from "../../lib/billing";
import { listLedger, resetLedger } from "../../lib/billing/ledger";

/*
 * A precomputed vector. Deriving the expected digest with the same call the
 * implementation uses would make this test circular — it would pass even if
 * the algorithm were wrong, so long as it were consistently wrong.
 */
const KNOWN_BODY =
  '{"event":"subscription.charged","payload":{"payment":{"entity":{"id":"pay_TEST1",' +
  '"order_id":"order_TEST1","amount":99900,"currency":"INR","notes":' +
  '{"virasat_reference":"acct-42"}}}}}';
const KNOWN_SECRET = "whsec_test_abc123";
const KNOWN_SIGNATURE = "a28e771f3d51fa31c51c1e30f595a7596cab58a8ae1053eee9faecf5abe9725a";

let body = "";
let signature: string | null = "";
let secret = "";

function headersWith(sig: string | null): Headers {
  const h = new Headers();
  if (sig !== null) h.set("x-razorpay-signature", sig);
  return h;
}

Given("the known-good Razorpay webhook body and signature", function () {
  body = KNOWN_BODY;
  signature = KNOWN_SIGNATURE;
  secret = KNOWN_SECRET;
});

When("the {word} is altered", function (part: string) {
  if (part === "body") body = body.replace("99900", "1");
  else if (part === "signature") signature = KNOWN_SIGNATURE.replace(/^a/, "b");
  else if (part === "secret") secret = `${KNOWN_SECRET}-wrong`;
  else throw new Error(`Unknown part "${part}" in the scenario table.`);
});

When("the signature header is absent", function () {
  signature = null;
});

When("the signature is truncated", function () {
  signature = KNOWN_SIGNATURE.slice(0, 20);
});

Then("the signature should verify", function () {
  assert.strictEqual(
    razorpaySignatureIsValid(body, signature, secret),
    true,
    "The known-good vector did not verify — the signing scheme has changed."
  );
});

Then("the signature should not verify", function () {
  assert.strictEqual(razorpaySignatureIsValid(body, signature, secret), false);
});

/* --- Verified event contents ------------------------------------------ */

let verified: ReturnType<ReturnType<typeof createRazorpayDriver>["verifyWebhook"]>;

When("the webhook is verified", function () {
  const driver = createRazorpayDriver({
    keyId: "rzp_test_key",
    keySecret: "secret",
    webhookSecret: KNOWN_SECRET,
  });
  verified = driver.verifyWebhook(KNOWN_BODY, headersWith(KNOWN_SIGNATURE));
  assert.ok(verified.ok, `Verification failed: ${verified.error}`);
});

Then("the event reference should be {string}", function (expected: string) {
  assert.strictEqual(verified.data?.reference, expected);
});

Then("the event type should be {string}", function (expected: string) {
  assert.strictEqual(verified.data?.type, expected);
});

/* --- Idempotency -------------------------------------------------------- */

let outcomes: WebhookOutcome[] = [];

function signedWith(secretValue: string, payload: string): Headers {
  return headersWith(createHmac("sha256", secretValue).update(payload, "utf8").digest("hex"));
}

Given("an empty billing ledger", function () {
  process.env.BILLING_DRIVER = "razorpay";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = KNOWN_SECRET;
  resetLedger();
  outcomes = [];
});

When("the same signed event is delivered three times", function () {
  for (let i = 0; i < 3; i++) {
    outcomes.push(handleWebhook(KNOWN_BODY, signedWith(KNOWN_SECRET, KNOWN_BODY)));
  }
});

When("an event with a bad signature is delivered twice", function () {
  for (let i = 0; i < 2; i++) {
    outcomes.push(handleWebhook(KNOWN_BODY, headersWith("deadbeef")));
  }
});

Then("it should be applied once and replayed twice", function () {
  const applied = outcomes.filter((o) => o.ok && !o.replayed);
  const replayed = outcomes.filter((o) => o.ok && o.replayed);
  assert.strictEqual(applied.length, 1, `expected one application, got ${applied.length}`);
  assert.strictEqual(replayed.length, 2, `expected two replays, got ${replayed.length}`);
});

Then("the ledger should hold {int} entries", function (count: number) {
  assert.strictEqual(listLedger().length, count);
});

Then("both deliveries should be refused with status {int}", function (status: number) {
  assert.strictEqual(outcomes.length, 2);
  for (const o of outcomes) {
    assert.strictEqual(o.ok, false);
    if (!o.ok) assert.strictEqual(o.status, status);
  }
});

Then("nothing should be recorded as applied", function () {
  const applied = listLedger().filter((e) => e.outcome === "applied");
  assert.deepStrictEqual(
    applied,
    [],
    "A refused event was recorded as applied, so a genuine retry would be suppressed."
  );
});

/* --- Configuration ------------------------------------------------------ */

let lastDriverName = "";

Given("the billing driver is set to {string}", function (name: string) {
  process.env.BILLING_DRIVER = name;
  lastDriverName = name;
});

Given("the billing driver is set to {string} with test credentials", function (name: string) {
  process.env.BILLING_DRIVER = name;
  process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_SECRET_VALUE";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_SECRET_VALUE";
});

Then("billing should report that it is not ready", function () {
  assert.strictEqual(billingStatus().ready, false);
});

Then("the billing reason should name the valid drivers", function () {
  const reason = billingStatus().reason ?? "";
  for (const expected of ["stub", "razorpay"]) {
    assert.ok(reason.includes(expected), `The reason did not mention "${expected}": ${reason}`);
  }
  assert.ok(reason.includes(lastDriverName), "The reason did not quote the bad driver name.");
});

Then("the reported status should not contain the key secret", function () {
  const serialised = JSON.stringify(billingStatus());
  assert.ok(
    !serialised.includes("rzp_test_SECRET_VALUE"),
    `The key secret appeared in the status payload: ${serialised}`
  );
});

Then("the reported status should not contain the webhook secret", function () {
  const serialised = JSON.stringify(billingStatus());
  assert.ok(
    !serialised.includes("whsec_SECRET_VALUE"),
    `The webhook secret appeared in the status payload: ${serialised}`
  );
});
