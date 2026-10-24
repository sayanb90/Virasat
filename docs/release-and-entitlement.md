# When the vault opens: release authorisation, entitlement and billing

**Status:** proposal, for review. Nothing here is built yet.
**Author:** drafted with Claude Code, 11 October 2026.

---

## Why this document exists

Virasat is a dead man's switch with a subscription attached, and those two
things pull in opposite directions. The moment the product is supposed to
work is also the moment the customer stops paying.

If a failed payment locks or deletes the vault, the family never learns it
existed. That is a total product failure, and it arrives silently.

So this is not really a payments document. It is a document about **who is
allowed to open the vault, and when** — with billing as one input among
several.

---

## 1. The problem in one table

Two signals. They are independent, and neither alone is enough.

|                        | **Paying**                    | **Not paying**                              |
| ---------------------- | ----------------------------- | ------------------------------------------- |
| **Checking in**        | Normal                        | Alive, chose to stop → genuine churn         |
| **Not checking in**    | Possibly deceased → escalate  | **Ambiguous — three very different realities** |

The bottom-right cell collapses three cases that demand different outcomes:

1. **Churned and disengaged.** Alive, lost interest, stopped checking in.
   → Keep the data for a while. **Never release it.**
2. **Alive and unaware.** Payment quietly failed; they still believe they
   are protected. → **The most dangerous case.** Closing them out destroys
   the product for someone relying on it.
3. **Deceased.** → Release, as promised.

No amount of inference separates 1 from 3: both end in silence, and they
demand opposite actions. The resolution is not cleverer logic. It is
**forcing a human answer**, and **refusing to act destructively while
unsure**.

---

## 2. The governing principle

| Wrong action                          | Recoverable?                        |
| ------------------------------------- | ----------------------------------- |
| Release a living person's vault       | No. Privacy breach, possibly actionable. |
| Delete                                | No. The product's entire promise, broken. |
| **Hold** — keep data, don't release, keep trying | **Yes. Costs cents per year.** |

> **Uncertainty always resolves to hold.** Never to delete, never to release.

Encrypted notes are a few KB. Holding an ambiguous account for years is a
rounding error against the cost of getting it wrong.

---

## 3. Roles

Three parties, with distinct jobs. One rename.

| Role            | Job                                                        |
| --------------- | ---------------------------------------------------------- |
| **Owner**       | Writes the notes. Checks in. Can always veto a release.     |
| **Beneficiary** | Receives the notes on release. Any number. One of them co-confirms the death. |
| **Witness**     | Vouches that the Owner is well; later confirms they are not. **One or two**, never more. |

### Rename: Trusted Friend → Witness

"Witness" is exactly the function, and for this audience it is already
familiar from the one legal document everyone has seen — a will has
witnesses. It needs no explanation, carries the right weight, and is
unmistakably distinct from Beneficiary.

Rejected: *Trusted Contact* (what every bank and brokerage calls this role —
generic, and the kind of borrowed phrasing we have been moving away from),
*Guardian* (implies ongoing duty of care we are not offering), *Keyholder*
(a nice metaphor, but untrue — they hold no key today).

**Cost of the rename:** UI copy, the `/trusted-friends` routes,
`TrustedFriendRecord`, the invite email template, and roughly a dozen
tests. Small now. Expensive after launch.

---

## 4. Entitlement: what a lapsed subscription does

Entitlement is a function of **billing status × liveness**, not billing
alone.

| State        | Entered when                                          | Behaviour                                                        |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| `active`     | Paid                                                   | Everything                                                        |
| `past_due`   | Payment failed, dunning running                        | Full access; reminders by email and SMS                           |
| `grace`      | Dunning exhausted **and still checking in**            | Read-only. Alive and not paying — keep asking.                    |
| `preserved`  | Dunning exhausted **and in escalation**                | Read-only. **Escalation and handover run to completion.** Billing attempts stop. |
| `archived`   | Someone **asserted** the Owner is alive and finished   | Read-only, export offered. **Release permanently disabled.**      |
| `released`   | Handover completed                                     | Retention clock starts                                            |

Two absorbing states: `archived` (alive, finished — never releases) and
`released` (confirmed, handed over). Everything ambiguous sits in
`preserved`, indefinitely and cheaply.

**`grace` → `preserved` must stay open.** Someone who stopped paying in
March can still die in June.

**`archived` can only ever be asserted, never inferred.** The Owner says "I
am done", or a Witness/Beneficiary reports they are alive but finished.
Silence never produces it. Silence produces hold.

### Invariants

These are the rules worth writing tests against first:

1. Non-payment never deletes data.
2. Non-payment never stops an escalation or a release.
3. A release never fires on a timer alone with nobody contacted.
4. Billing attempts stop the moment an account reaches `preserved` or
   `released`. Charging a deceased person's account is indecent, invites
   chargebacks, and is a reputational grenade.
5. The Owner's veto always wins, from any state, up to the moment of release.

---

## 5. Release authorisation: a Witness, a Beneficiary, and an owner veto

### The rule

> Release requires **one Witness confirmation**, **one Beneficiary
> confirmation**, *and* **the Owner failing to object during a 14-day
> cooling-off window**.

*Revised 24 October 2026* (see `docs/authentication.md` §7). The first draft
accepted any two confirmations, or one plus a death certificate. That is
replaced by a single rule, with one confirmation from each side:

| Confirmations received | Releases? |
| :--- | :--- |
| A Witness + a Beneficiary | **Yes**, after the cooling-off window |
| Two Witnesses | No |
| Two Beneficiaries, or any number of them | No |
| One person alone | No |

Each side covers a different weakness. A Witness is chosen as someone who
gains nothing from the release. A Beneficiary is the person who will act when
the time comes. Requiring one of each means neither the people who gain nor
an outsider can start a release on their own.

The rule is also enforced by cryptography, not only by our server: the
handover code is rebuilt from a Witness piece and a Beneficiary piece, which
are handed over only when each confirms (`docs/authentication.md` §7).

Two parties who know each other could be the same family faction with the
same incentive. Two signatures are not much harder to obtain than one. What
makes it safe is the third leg: a confirmed release triggers a **loud, dated
warning to the Owner on every channel** —

> *"Meera and Anil have told us you have passed away. Your notes go to Meera
> on 14 March. Tap here if you are reading this."*

A living person stops it with one tap. The attempt is logged.

### Who may be named

- **Witnesses: at least one, at most two.** The second exists only as a
  spare, in case the first dies first or cannot be reached. Two Witnesses
  agreeing is still not enough.
- **Beneficiaries: any number.** Any one of them can supply the Beneficiary
  confirmation, and every Beneficiary then receives their own notes.

The death-certificate route is dropped for simplicity. A certificate would
need manual review and a way to unlock without a Witness, and that undoes
the guarantee above.

### The failure mode this introduces

Requiring a confirmation from each side means **the vault can now fail to open** — the
mirror image of the original problem, and just as bad. Over a twenty-year
horizon:

- A Witness is often a contemporary. They may die first.
- Email addresses rot. Numbers change.
- A grieving family may simply never act.

Mitigations, in order of value:

1. **A spare on the Witness side.** A second Witness, so that losing one does
   not block the release. The Beneficiary side is already resilient: any one
   of them is enough.
2. **Keep contacts warm.** Ping each named person annually — *"Mr Sharma has
   named you. Still the right address?"* A bounce or a long non-reply
   prompts the Owner to add someone else.
3. **Treat a side with no reachable person as a product alarm**: no
   reachable Witness, or no reachable Beneficiary. Surface it to the Owner the
   way a failing backup would be.

Without (3), the product quietly stops working and nobody finds out until it
is needed.

### Reaching a living Owner through their family

The most effective single move: **contacting the Beneficiary is also a
channel back to the Owner.** If Mr Sharma is alive and disengaged, and his
daughter is told *"your father named you; his notes unlock to you in 14
days"*, she will phone him that afternoon.

The social graph resolves what no inference can.

---

## 6. Shrinking the ambiguous bucket

Most of the work is upstream of all this.

**Two one-tap actions in every message, not one:**

> **I am safe and well** — resets everything
> **Stop — I don't want this any more** — clean exit

Today a disengaged person has no easy way to say "I'm leaving", so they go
quiet and land in the hardest bucket. Give them a door and most will use it.
Silence then means considerably more.

**Verify email and mobile at signup, and again at renewal.** A typo on day
one means the entire ladder shouts into a void for two years and we conclude
the person is dead.

**Bounce handling becomes mandatory.** The email module currently has none.
For this product a hard bounce is not a delivery statistic — it is a
critical finding: *the ladder is broken, this silence is not evidence of
anything.*

**Triage on the payment failure reason.** The gateway webhook says why, and
the reasons are not equivalent:

| Reason                       | Reading                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| Card expired                 | Benign. Happens to everyone. Very weak signal.                  |
| Insufficient funds           | Ambiguous — an empty account or a frozen one.                   |
| **Mandate revoked at bank**  | **Someone acted.** A living person, or an executor.             |
| **Account closed / frozen**  | In India a bank notified of death freezes the account. Combined with heartbeat silence, the strongest death signature available. |

**One escalation ladder, not two.** A payment failure is evidence about
liveness. Feed it into the existing heartbeat escalation so it *accelerates*
the ladder, rather than running a parallel dunning sequence.

And change the wording. *"Your payment failed"* reads as marketing and gets
ignored — which is precisely how case 2 happens. Lead with the consequence,
not the invoice.

**Log every contact attempt** — channel, timestamp, delivery result, content.
If a release is ever made wrongly, the difference between a defensible
decision and a negligent one is being able to show *"23 attempts over 14
months across four channels, two Witnesses and one Beneficiary contacted, no
response."* The append-only security log is the right home.

---

## 7. Billing

### Pricing shape

- **Annual, not monthly.** A product that stays silent for nine months
  should not ask for twelve debits a year. Fewer debits means fewer mandate
  failures, less fee drag at low ticket size, and fewer chances to break
  during the quiet period.
- **Lifetime at ~$100.** This is the clean answer for the oldest cohort —
  exactly the customers where the ambiguity bites hardest. No mandate to
  expire, no dunning, no quadrant to resolve. Lead with it as *"never think
  about this again"*, not as the expensive option.
- Consider 3-year and 5-year prepaid as a middle rung.
- **Annual billing means we are always paid ahead.** Someone who dies in
  month two has already funded the next ten.

### Gateway options (India-first)

> **Caveat: these figures come from secondary sources.** The container's
> network policy blocked `razorpay.com`, `cashfree.com` and `stripe.com`, so
> none of it was verified against an official rate card. **Confirm every
> number before signing anything.**

|                        | Razorpay                            | Cashfree                                    |
| ---------------------- | ----------------------------------- | ------------------------------------------- |
| Domestic platform fee  | 2% + 18% GST ≈ **2.36%**            | **1.95%** standard                           |
| UPI                    | MDR zero by law; platform fee still applies | same                                 |
| Subscriptions add-on   | ~0.5% promo / 0.9% standard *(sources disagree)* | folded in, or per-debit fixed fees |
| UPI AutoPay per debit  | not found                           | **₹5** under ₹1,000, **₹15** at ₹1,000+; mandate creation ₹7.50 |
| Setup / annual         | ₹0 / ₹0                             | ₹0 / ₹0                                      |
| International cards    | 3% + GST ≈ 3.54%                    | available                                    |
| RBI PA-CB licence      | yes                                 | yes                                          |

**The fixed-fee difference is large at our price point.** On ₹999/year:

- Razorpay ≈ 2.5% → **~₹29** including GST
- Cashfree UPI AutoPay ₹5 → **~₹6** including GST

Note the cliff: Cashfree's UPI AutoPay fee triples at ₹1,000. **Pricing at
₹999 rather than ₹1,049 would save more in fees than the extra ₹50 earns.**

One contested point: a Razorpay-linked guide describes a **0.4% UPI MDR on
payments above ₹2,000** from 15 October, shown separately from the platform
fee. Other sources still describe UPI as zero-MDR. Unconfirmed.

**Recommendation: Razorpay**, unless per-transaction cost dominates. Mature
Subscriptions product, best documentation, holds a PA-CB licence so one
integration carries us into international. Paying ~₹23 more per customer per
year to avoid a second integration and a second compliance surface is worth
it until volume says otherwise.

### Recurring payments in India

RBI's e-mandate framework (effective 21 April 2026):

- No additional authentication up to **₹15,000 per debit** once the mandate
  exists. (₹1 lakh applies to insurance, MF SIPs and credit card bills — we
  are not in those categories.)
- **Mandate setup requires AFA** — an OTP or UPI PIN. So does changing or
  cancelling it.
- **24-hour pre-debit notice** is required, naming merchant, amount, date and
  mandate reference.

None of this blocks us at a ₹999 price point. It does mean we need a gateway
with a genuine mandate product — recurring billing cannot be built on
one-time payment APIs. (One source reports PhonePe has no first-party
subscriptions product, which would rule it out.)

The pre-debit notice needs sending. The email module can do it.

### International

- **Direct** (Razorpay/Cashfree international, Stripe): ~3–4.3% plus FX
  markup. We remain the seller, so we carry VAT/GST/sales tax in every
  jurisdiction. For a small team that is the expensive part, not the
  percentage.
- **Merchant of Record** (Paddle, Lemon Squeezy): ~5% + $0.50. They become
  the legal seller and handle tax everywhere. *Unconfirmed whether either
  accepts Indian-registered sellers or pays out in INR — ask directly.*

An Indian entity taking foreign payments must route through a **PA-CB
authorised** channel under RBI's framework. We will also need FIRC/FIRA for
export-of-services proof, and an LUT so exports are zero-rated for GST.

**Phase international behind domestic.** Don't take on multi-jurisdiction
tax registration before there is revenue to justify it.

### Prerequisites before any integration

Registered entity with PAN and a current account; GST registration; and —
gateways check this at onboarding — a live **pricing page, refund and
cancellation policy, terms, privacy policy and contact details** on the site.

---

## 8. What this means for the crypto

Everything in section 5 is an **authorisation** control, not a cryptographic
one. It governs whether our server hands over the envelope. A compromised
server ignores it entirely.

And today the server **also holds every Beneficiary's private key**, so
"two people must agree" would be a promise the code cannot keep.

Three defects on `main` are therefore prerequisites, not housekeeping.
They shipped with #3 — pinned, not fixed — and two of them are held open by
`test.fixme` specs that will pass the moment the underlying issue is solved:

1. The chest key encrypts nothing, so a Beneficiary cannot read what is
   released to them. *(`e2e/handover.spec.ts`)*
2. Note titles are stored in plaintext. *(`e2e/security.spec.ts`)*
3. The server stores Beneficiary private keys.

All three change the stored payload format, so they are one piece of work
rather than three.

**The two-party model is the reason to fix these properly rather than
minimally** — it tells us what the crypto has to support.

### Real two-party cryptography

Now specified in `docs/authentication.md` §7, as three pieces rather than
Shamir shares. The handover code is rebuilt from a server piece, a Witness
piece and a Beneficiary piece, so a Witness and a Beneficiary are genuinely
both required, and a breach of our infrastructure before release reveals
nothing. It also removes defect 3: Beneficiaries no longer need key pairs.

The tradeoff is unchanged: if every Witness, or every Beneficiary, loses
their piece, nobody can open the vault — including us. The yearly "check it
still works" in that document exists for this reason.

---

## 9. Proposed phasing

| Phase | Scope |
| ----- | ----- |
| **0** | Rename Trusted Friend → Witness. Small now, expensive later. |
| **1** | Entitlement + release state machines, fully tested, with a stub billing driver. No gateway. Proves the decision logic before any vendor commitment. |
| **2** | Fix the three crypto defects as one change. |
| **3** | Razorpay integration behind a provider-agnostic `lib/billing/` driver interface, mirroring `lib/email/`. Webhook-driven entitlement, never client-driven. Idempotent webhook handling — a replayed `payment.captured` must not extend a subscription twice. |
| **4** | Bounce handling, mobile/SMS channel, annual contact re-verification. |
| **5** | International, via a Merchant of Record. |

Phase 1 is deliberately first. The hard part of this product is the decision
logic, and it is entirely testable in Cucumber without a payment gateway in
sight.

---

## 10. Open questions

1. **Confirm the Witness rename** before Phase 0.
2. **Annual price point.** ₹999 is assumed throughout; the Cashfree fee cliff
   at ₹1,000 argues for staying just under it.
3. **Lifetime price in INR**, and whether it is offered in both markets.
4. ~~**Minimum Witnesses at setup.**~~ Settled 24 October 2026: at least one,
   at most two. One Beneficiary is also required.
5. ~~**Cooling-off window length.**~~ Settled 24 October 2026: 14 days.
6. **Long-stop.** How long do we hold a `preserved` account where nobody —
   Owner, Beneficiary or Witness — ever responds? Proposal: five years, then
   a final notice blitz, then deletion. Needs to be in the terms.
7. **Gateway: Razorpay or Cashfree.**
8. **Does a Witness confirmation need identity verification**, or is a
   verified email plus the cooling-off window enough for v1?
