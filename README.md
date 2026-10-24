# Virasat — a zero-knowledge vault for the things your family will need

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![WebCrypto](https://img.shields.io/badge/Security-WebCrypto_AES--256--GCM-emerald?style=for-the-badge&logo=shield)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

**Virasat** is a digital estate vault with an automated check-in cycle, built for
senior citizens and their families. A person writes down what their family would
otherwise have to hunt for — policy numbers, where the locker key is, who the
nominee is — and it is encrypted on their own device before it goes anywhere. If
they stop confirming they are well, the vault is handed to the people they chose.

The architecture is zero-knowledge by construction: the server stores ciphertext,
IVs and sealed envelopes, and holds no password, no vault key and no plaintext.

### A note on vocabulary

The code and this document say *check-in cycle*, *escalation* and *release*. The
shipped UI never does. On screen it is "I am safe and well", "your family", and
"taking a break" — the audience is 65+ and the product's first job is not to feel
like software about dying. If you add a screen, keep that split: precise names in
the code, plain language in front of the user.

---

## 🌟 Core principles

* **Silence by default.** The app asks for nothing for the first ~74% of the
  user's chosen cycle. On the default one-year cycle that is nine months of
  genuine silence — no logins, no nudges, no notifications.
* **Zero-knowledge, enforced by shape.** Encryption happens in the browser via
  WebCrypto. The server is blob storage plus a heartbeat queue; it cannot read
  a note even if it wanted to. See [Known gaps](#-known-gaps) for the two places
  this is not yet fully true.
* **Senior-friendly by default.** High contrast, 18–24pt+ type, 60px+ touch
  targets, one decision per screen, and no jargon on any surface a user sees.
* **Proportional escalation.** The ladder from silence to release is derived from
  the user's own interval, not hardcoded. Change the interval and the shape holds.
* **India-first, international-ready.** One universal category structure with
  swappable vocabulary per market — not a translation layer bolted on later.

---

## 🔐 Cryptographic architecture

### What runs today

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT-SIDE DEVICE                                |
|                                                                                   |
|  Password + salt --> [ PBKDF2-SHA-256, 600k ] --> K_root --HKDF--> K_auth (proof) |
|                                                          --HKDF--> K_wrap         |
|                                                                                   |
|  K_vault (random, made at sign-up), wrapped by K_wrap, the Recovery Kit,          |
|  the PIN key and the Face ID key. Only the wrapped copies are stored.             |
|                                                                                   |
|  { notes, file, fileName, mimeType }                                              |
|          |                                                                        |
|          +--> [ pack ] --> [ AES-256-GCM, fresh 12-byte IV, K_vault ] --> blob    |
|                                                                                   |
|  K_chest (per note, 256-bit) --> [ RSA-OAEP 2048, beneficiary public key ]         |
|                                                      |                            |
|                                                      v                            |
|                                                 E_ben(K_chest)                    |
+-----------------------------------------------------------------------------------+
                                         |
                            ciphertext, IV, envelope, title
                                         v
+-----------------------------------------------------------------------------------+
|                        ZERO-KNOWLEDGE SERVER & DATABASE                           |
|                                                                                   |
|  • Stores Base64/Hex ciphertext, IVs, salt and sealed envelopes.                  |
|  • No password, no K_vault, no plaintext body ever reaches it.                    |
|  • Note TITLES are currently stored in the clear — see Known gaps.                |
+-----------------------------------------------------------------------------------+
```

**Read the diagram carefully: `K_chest` does not currently encrypt anything.**
The payload is sealed with `K_vault`, and `K_chest` is minted, sealed to the
beneficiary and stored beside it. A beneficiary therefore receives a key that
opens nothing.

Two other things the diagram does not promise: note **titles** are stored in the
clear, and the server currently keeps each beneficiary's RSA **private** key as
well as their public one. All three are in [Known gaps](#-known-gaps), they
interact, and they are the work standing between this and a product that is
honestly zero-knowledge.

### Keys (`K_root`, `K_auth`, `K_wrap`, `K_vault`)
- **PBKDF2 / SHA-256, 600,000 iterations** over the password and a per-account
  salt gives `K_root`, on the device (`lib/crypto/keys.ts`). HKDF splits it into
  `K_auth`, the login proof the server stores only a slow hash of, and `K_wrap`,
  which never leaves the device.
- **`K_vault`** is random, made once at sign-up, and encrypts every note. The
  server stores it only wrapped: by `K_wrap`, and by the Recovery Kit code. The
  phone stores it wrapped by its Face ID key and by its PIN key. Changing the
  password re-wraps one key; no note is touched.
- Unlocked, `K_vault` lives in memory only (`lib/auth/client.ts`). A cold
  start, five minutes in the background, or "Lock now" drops it.
- **Precomputed hex lookup engine** for encoding large binary ciphertexts
  (PDFs, images) without hitting V8 string-concatenation limits.

### Symmetric encryption (AES-256-GCM)
- Every note body and file attachment is packed into one payload and encrypted
  with a unique, cryptographically random 12-byte IV (`lib/crypto/payloadCodec.ts`).
- The packing format carries the file bytes, filename and MIME type inside the
  ciphertext, so none of them leak as metadata.

### Beneficiary envelopes (`E_ben(K_chest)`)
- Each note mints a unique 256-bit chest key.
- When a note is addressed to a loved one, that key is envelope-encrypted with
  their RSA-OAEP 2048-bit public key, for them to open with their private key on
  release. Seed beneficiaries carry demo keys; a note addressed to one falls back
  to an unsealed demo envelope rather than failing the user's save.
- **The key pair is currently generated in the browser and both halves are sent
  to the server**, so the envelope offers no protection against the server
  itself. See defect 3 in [Known gaps](#-known-gaps).

### Where the crypto lives

| Concern | File |
| :--- | :--- |
| The key hierarchy, Recovery Kit codes, the PIN key | `lib/crypto/keys.ts` |
| What sign-up, sign-in and recovery send, and what stays | `lib/crypto/account.ts` |
| What a phone holds for Face ID and the PIN | `lib/device/core.ts` |
| Hex codec (and the old passphrase KDF the specs still pin) | `lib/crypto/argon2.ts` |
| AES-GCM primitives, chest keys, hex codec | `lib/crypto/aes-gcm.ts` |
| Payload packing (body + attachment) | `lib/crypto/payloadCodec.ts` |
| RSA-OAEP envelopes | `lib/crypto/asymmetric.ts` |
| The order all of it happens in | `lib/vault/notes.ts` |
| Dev-only logging that must never print key material | `lib/crypto/log.ts` |

`lib/vault/notes.ts` is the only place that choreographs the sequence. Change
the format there, not in a screen.

---

## ⏱️ Check-in cycle & escalation

The cycle length is the user's choice. Phase boundaries are stored as fractions
of the original 365-day design, so a shorter or longer interval produces the same
escalation *shape* rather than a differently-tuned one
(`lib/state/heartbeatMachine.ts`).

| Phase | Fraction of cycle | On a 1-year cycle | What happens |
| :--- | :--- | :--- | :--- |
| **P0 Silent** | 0 → 0.740 | Days 0–270 | Complete silence. No alerts, no required logins. |
| **P1 Gentle** | 0.740 → 0.904 | Days 270–330 | 5 gentle check-in emails, 12–14 days apart. |
| **P2 Urgent** | 0.904 → 0.945 | Days 330–345 | 5 urgent SMS + email alerts, 3–4 days apart. |
| **P3 Critical** | 0.945 → 1.0 | Days 345–365 | 10 daily alerts across email, SMS and WhatsApp. |
| **P4 Released** | 1.0+ | Day 365+ | Chest key envelopes released to the chosen beneficiaries. |

**Intervals** (`CYCLE_OPTIONS`): every 6 months, once a year *(default)*,
every 18 months, every 2 years. Stored server-side in `AccountSettings`, because
the escalation engine — not the browser — is what depends on them.

Both the phase badge and the notification log are derived from the chosen cycle:
`getPhaseFromElapsedDays()` and `generateNotificationsForElapsedDays()` each take
`cycleDays`, and every cycle length dispatches the same full ladder of 31 alerts
by its end. `/api/heartbeat` reads the user's actual cycle; nothing
assumes 365 days.

**`POST /api/scheduler` is a test-only time machine.** It can advance the clock
past the end of the cycle, which releases the vault, so it 404s unless
`VIRASAT_E2E=1` — the same gate as `/api/test/reset`. Nothing in the UI calls it.

### Taking a break (vacation mode)

A trip, a hospital stay, or a stretch without a phone should not start the
escalation ladder. A user can pause for 2 weeks, 1 month, 3 months or 6 months.

- **6 months is a structural cap** (`MAX_VACATION_DAYS = 183`), rejected by
  `POST /api/settings` rather than only hidden in the UI — an API caller cannot
  pause indefinitely and quietly disable their own switch.
- **Paused days are credited back on return.** `settleVacation()` adds the days
  actually paused back to the cycle, capped at the hold's own end date so an
  overdue return cannot mint extra time, and floored at zero.
- Resuming early is one tap, and a pause that expires settles itself on next read
  (`settleVacationIfExpired`).

### Trusted friends

A second, human signal next to the automated one. A user invites people who can
vouch for them; an invite link is accepted in the invitee's own browser, and only
then does the entry go green. Duplicate invites are refused, and the whole
feature can be switched off per account.

---

## ✨ Features

- **🗂️ Two-level category tree** — 8 groups, 46 universal subcategories (48 in
  India), each with a plain-English line saying exactly what belongs there.
- **🌍 Locale packs** — India sees EPF/UAN, PPF, NPS/PRAN, demat DP IDs, folio
  numbers, Aadhaar and PAN, khata and encumbrance certificates, plus two
  subcategories with no international counterpart: **Nominee Details** and
  **Bank Locker**. Chosen in Settings; switching never rewrites stored notes.
- **📝 Encrypted notes** — create, read, edit in place, attach a file to, and
  delete. Bodies and attachments are ciphertext before they leave the device.
- **📎 Attachments** — a PDF or image is packed inside the encrypted payload and
  survives save, reopen and removal without losing the note.
- **🔑 In-memory session** — the master key is derived on unlock and held only in
  the tab. Lock, or close the tab, and it is gone.
- **👥 Loved ones & heirs** — beneficiaries with RSA public-key bindings, and a
  per-note recipient chooser.
- **💚 Safety check-in** — one tap to confirm you are well. A fast-forward
  endpoint exists for walking the escalation ladder, but it is test-only
  (see below) and nothing in the UI calls it.
- **🏖️ Vacation mode** — pause the cycle for up to 6 months, with paused days
  credited back.
- **🤝 Trusted friends** — invite, accept in the invitee's own browser, disable.
- **💾 Backup & restore** — export an encrypted backup file (verified to contain
  no plaintext), delete everything, restore, and confirm it still decrypts.
  Backup history is kept locally and individual entries can be forgotten.
- **🔑 Sign-in** — email and password, or Apple / Google / Facebook (a stub
  driver until the native app), then Face ID or a PIN every time the app opens.
  A new phone needs an emailed code. Forgotten password: on a phone already set
  up, or with the printed Recovery Kit and a 72-hour hold the Owner can stop.
  See [Signing in](#-signing-in).
- **📥 Family views** — `/claim` tells a beneficiary that notes arrive by email
  (delivery itself is not built yet), and `/inherited` shows what has been left
  to the signed-in user. Neither is behind the sign-in gate.
- **🛡️ Security log** — an append-only record of cryptographic operations, folded
  under Settings rather than sitting in the main navigation.
- **💳 Billing** — provider-agnostic (stub or Razorpay), webhook-driven, with
  signature verification and replay suppression. See [Billing](#-billing).
- **📧 Email** — provider-agnostic delivery (console, Resend or SendGrid) for
  invitations, the check-in ladder and the release notice, sent at most once
  each and never carrying key material. See [Email](#-email).
- **❓ Help** — plain-language answers, reached from Settings ("Get support")
  and from the beneficiary's `/inherited` screen.

### Routes

| Route | Purpose |
| :--- | :--- |
| `/` | Home — cycle status and the safety check-in |
| `/welcome`, `/welcome/sign-in` | Welcome, then sign up or sign in (email, or a provider) |
| `/welcome/recover`, `/welcome/recover/cancel` | Forgotten password, and the Owner's "this is not me" link |
| `/notes` | The category tree |
| `/notes/[subcategoryId]` | Notes within a subcategory |
| `/notes/[subcategoryId]/new` | Write a note |
| `/notes/[subcategoryId]/[noteId]` | Read / edit a note |
| `/beneficiaries` | Loved ones and heirs |
| `/trusted-friends`, `/trusted-friends/accept/[token]` | Invite and accept |
| `/heartbeat` | Cycle detail and the escalation simulator |
| `/backup` | Export, restore, delete everything |
| `/settings` | Country, interval, vacation mode, security log |
| `/audit` | The security log itself |
| `/claim`, `/inherited` | For family: how notes arrive, and what was left to you |
| `/help` | Plain-language help (linked from Settings and `/inherited`) |
| `GET /api/email` | Email configuration and the send ledger |
| `GET /api/billing` | Billing configuration and the webhook ledger |
| `POST /api/billing/webhook` | Signature-verified provider events |
| `/api/auth/*` | Sign-up, sign-in, device unlock, refresh, recovery — see [Signing in](#-signing-in) |

---

## 🔑 Signing in

Designed in [`docs/authentication.md`](docs/authentication.md); phase 1 is built.
Every sign-in has two tiers, and **the server**, not the app, decides when both
are done:

| Tier one | Tier two | Result |
| :--- | :--- | :--- |
| Password, or a provider, on a phone already set up | Face ID (a signature from the phone's biometric key) or the PIN (a signature *and* a server-checked PIN) | Full session |
| Password on a new phone (a provider alone cannot open the vault there) | A code emailed to the account | Full session, then set up Face ID and PIN |
| A remembered sign-in (refresh token) | Face ID or PIN, on every cold start and after 5 minutes away | Full session |

- **Every route calls `requireSession`** (`lib/auth/http.ts`) or is on a short,
  commented public allow-list. `e2e/auth.spec.ts` walks `app/api/` and fails if
  any other route answers without a session.
- **Tokens, not cookies:** a 15-minute access token in memory, and a 30-day
  refresh token that rotates on every use; presenting one twice ends that
  sign-in everywhere. Both are stored server-side as hashes.
- **The PIN:** five wrong PINs delete the server's half of the PIN key, after
  which only the password brings that phone back.
- **Social providers** take name and email only, and never link to an existing
  account on email alone — the password is asked first. Until the native app
  (phase 4), `AUTH_PROVIDERS_DRIVER=stub` shows a test sheet; it refuses to run
  in a production build outside the e2e harness.
- **Forgotten password:** path A on a phone already set up (Face ID / PIN + an
  email code), path B with the printed Recovery Kit (an email code + the kit +
  a 72-hour hold, with an emailed "this is not me" link). The kit is spent on
  use and a new one issued.
- **The browser build is a harness, not the product.** Device keys live in
  IndexedDB and "Face ID" is a confirm button (`lib/device/bridge.ts`); the
  server still checks the biometric key's signature. The native app will
  replace the bridge with Keychain / Keystore.

| Variable | Meaning |
| :--- | :--- |
| `AUTH_PROVIDERS_DRIVER` | `stub` *(default)* or `native` (not built yet; reports not-ready) |
| `AUTH_SERVER_SECRET` | Keys the fake salts for unknown emails. Random per process if unset, which is right only while the store is in memory |

---

## 📧 Email

Email is how a Virasat user is reached at all, and how a beneficiary learns
anything was left to them. The module is provider-agnostic: the app composes
messages, a driver puts them on the wire.

### The rule

> **No email Virasat sends may contain key material, passphrase material, or
> any decrypted note content.**

Email is plaintext between providers, permanent in two or more inboxes, and the
most commonly breached thing a person owns. An email carrying the key to the
vault *is* the vault. So a Virasat email only ever says *something has
happened, here is where to go* — the secret itself is reached by the recipient,
on a device they control, with a key the server never had.

This is enforced, not just intended. `features/08_email_delivery.feature`
checks every template for exact secret values, for a PEM block, and for
anything merely *shaped* like a secret — a run of 32+ hex characters, a long
base64 blob. **Add a template, add it to that scenario's table.**

### Configuration

Copy `.env.example` to `.env.local`. Everything is optional; with nothing set,
email prints to the server log instead of going out.

| Variable | Meaning |
| :--- | :--- |
| `EMAIL_DRIVER` | `console` *(default)*, `resend` or `sendgrid` |
| `EMAIL_FROM` | `"Virasat <hello@yourdomain.com>"` — the domain must be verified with your provider |
| `APP_URL` | Absolute base for links in emails. Defaults to localhost, which is wrong anywhere but development |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` | Set only the one matching `EMAIL_DRIVER` |

`console` is the default deliberately: a half-configured deployment should
print to the log, never quietly post a real address to a provider. An
unrecognised `EMAIL_DRIVER` reports itself as not-ready rather than silently
falling back, so a typo surfaces instead of hiding.

Both real drivers are a single authenticated `POST`, so **no new
dependencies**. Adding a provider means one file implementing `EmailDriver`
and one line in `resolveDriver()`. Amazon SES would need SigV4 signing and is
the obvious next one for Indian deployments (`ap-south-1`).

### What gets sent

| Message | Trigger | Carries |
| :--- | :--- | :--- |
| Trusted Friend invitation | Inviting someone | The accept link, nothing else |
| Safety check-in (gentle / urgent / critical) | The escalation ladder | A link to the safety screen and how long is left |
| Release notice | The cycle ending without a check-in | That notes exist, how many, and where to go — explicitly **not** the key |

The release notice says in plain words that the key is not enclosed and that
we do not hold a copy, because the first thing a grieving relative will do is
search that email for a password.

### Sending at most once

The ladder is a pure function of elapsed days, recomputed on **every** read of
`/api/heartbeat`. Without a ledger, a user would receive the entire ladder
again on every page load. Each message carries an `idempotencyKey`;
`lib/email/outbox.ts` records what has been handed to a driver and refuses a
repeat. A *failed* send does not close the key, so a provider outage stays
retryable instead of permanently swallowing a release notice.

`sendEmail()` never throws. `/api/heartbeat` is how a user says *I am alive* —
an email provider being down must not break that.

There is no scheduler in this build, so a read of `/api/heartbeat` is also the
dispatch trigger. `GET /api/email` reports the configuration (presence of a
key, never its value) and the outbox.

**A paused account is never chased** — vacation mode stops the ladder and the
release, and a spec asserts nothing is sent while paused.

### Known limits

- The outbox is in-memory, like the rest of this build's state. **This is the
  first thing that must move when persistence lands:** a ledger that empties
  on restart means a restart mid-ladder re-sends everything — which here means
  re-sending a release notice to a grieving family.
- Nothing verifies an address before sending to it, and bounces are not
  handled. A typo in a beneficiary's email fails silently from the user's side.
- SMS and WhatsApp rungs of the ladder are still simulated. The dispatcher
  skips them rather than pretending.

---

## 💳 Billing

Provider-agnostic, the same shape as the email module: the app asks for a
checkout or a subscription, a driver talks to whoever moves the money.
Drivers: `stub` (the default) and `razorpay`. The Razorpay driver is plain
REST over `fetch`, so **no new dependencies**.

**Nothing here reads a price or a plan.** Tiers are a product decision that
has not been made, and guessing one in code would make it the default by
accident. `lib/billing/` moves money; it does not decide how much.

### The two rules

> **Entitlement is decided by webhooks, never by the browser.** A client
> saying "payment succeeded" is a claim. Only a signature-verified webhook is
> a fact.

> **No card data ever reaches this app.** We hold provider identifiers and
> nothing else. The vault's zero-knowledge posture must not acquire a billing
> hole.

### Webhook verification

Razorpay signs HMAC-SHA256 over the **raw** request body, keyed with the
dashboard webhook secret (*not* the API key secret), hex, in
`X-Razorpay-Signature`.

Two things that are easy to get wrong and expensive to debug:

- The route reads `await req.text()`. Parsing and re-serialising JSON
  produces different bytes from what the provider signed, so the signature
  would never verify. This is the single most common way webhook
  verification silently breaks.
- Comparison is **timing-safe**. A plain `===` on a digest leaks, through
  response timing, how many leading bytes a guess got right.

A failure we could not process returns **5xx so the provider retries**. Only
a bad signature is 401, because retrying that is pointless.

The check is pinned by a **precomputed vector** in
`features/09_billing_webhooks.feature` — deriving the expected digest with
the same call the implementation uses would make the test circular, passing
even if the algorithm were wrong so long as it were consistently wrong.
Verified by sabotage: switching the HMAC to SHA-1 fails the scenario.

### Applied at most once

Providers retry. The same `subscription.charged` arriving twice must not
extend a subscription twice. Every event is recorded by its provider event
id in `lib/billing/ledger.ts` and replays are refused — but a *rejected*
event does not close the id, so a genuine retry after a transient fault is
still processed.

### Configuration

| Variable | Meaning |
| :--- | :--- |
| `BILLING_DRIVER` | `stub` *(default)* or `razorpay` |
| `RAZORPAY_KEY_ID` | Public — the browser checkout needs it |
| `RAZORPAY_KEY_SECRET` | Server only |
| `RAZORPAY_WEBHOOK_SECRET` | Set separately in the dashboard; differs between test and live |

`GET /api/billing` reports configuration shape and the ledger — whether
credentials are present, never what they are.

### Known limits

- **`lib/billing/` does not apply events to accounts yet.** What a payment or
  a lapse means depends on liveness as well as billing, and that model is
  still being settled in `docs/release-and-entitlement.md`.
- **The ledger is in-memory**, like the rest of this build's state. It must
  move to the database with everything else: a restart mid-retry would
  double-apply whatever arrives next.
- **The Razorpay driver has never run against Razorpay.** The container's
  network policy blocks `api.razorpay.com`, so request and response shapes
  come from documentation rather than from a live call. Everything offline —
  signature verification, idempotency, configuration — is tested; everything
  on the wire is not.

---

## 🗂️ Category taxonomy & locale packs

The tree is deliberately split in two:

| Layer | What it holds | File |
| :--- | :--- | :--- |
| **Structure** | Group and subcategory **ids** (`insurance.life`, `banks.retirement`). Identical in every market. | `lib/taxonomy/tree.ts` |
| **Vocabulary** | Labels, guidance text, extra subcategories and ordering, per country. | `lib/taxonomy/locales/*.ts` |

Notes persist the **id**, never the label. **Subcategory ids are a permanent
contract** — renaming one orphans every note already filed under it.

A user can switch country and every note keeps a meaningful category, including
notes filed under a subcategory that only exists in another market:
`locateSubcategory()` looks in the active locale, and `describeSubcategory()`
searches *every* pack and then the universal tree before falling back to
"Uncategorised". That fallback is what keeps a note reachable after a country
switch, and `localisation.spec.ts` guards it.

**Adding a market is a content task, not a refactor:** add a `LocalePack` under
`lib/taxonomy/locales/`, register it in `LOCALE_PACKS`, and the whole app picks
it up. Each pack may override labels and guidance, hide subcategories, append
market-specific ones, and promote the ones its users care about most.

`SubcategoryDef.essential` is carried through the resolver but unused — it exists
so a shorter "Essentials" view can later be a filter rather than a re-modelling
exercise.

---

## 🧪 Tests

Two suites, deliberately split by what they are good at.

```bash
npm test          # Cucumber — logic, crypto, taxonomy, escalation arithmetic
npm run test:e2e  # Playwright — real browser, real flows
npm run test:e2e:ui  # Playwright, interactive
npm run test:all  # both
```

Both run on every pull request (`.github/workflows/ci.yml`, no branch filter, so
stacked PRs are gated too).

**Cucumber (95 scenarios)** covers things with no UI: AES-GCM round trips and key
derivation, the note payload codec with attachments (a real 1.4MB buffer),
taxonomy resolution and locale packs, escalation phase maths *at every cycle
length*, the backup format, the vacation cap and credit-back arithmetic, and a
guard that no key, salt or passphrase material is ever written to the console or
put into an email. `10_authentication.feature` runs the sign-in, PIN, refresh,
social and recovery rules against the real device-side crypto.

**Playwright (58 scenarios)** drives a real browser at 390×844 against the
**production build**, not the dev server, so the specs exercise what ships:

| Spec | Covers |
| :--- | :--- |
| `auth` | no route answers without a session, a password alone cannot reach the notes, a new phone needs an emailed code, Face ID and PIN unlock, five wrong PINs lock, Google sign-up still asks for a password, both forgotten-password paths, the Owner's stop link, the Recovery Kit reminder |
| `onboarding` | the welcome gate, sign-up, and that an invited Trusted Friend or a Beneficiary is never trapped by it |
| `notes` | unlock, India vocabulary, write → save → decrypt, edit-in-place without duplicating, delete, recipient chooser |
| `trusted-friends` | invite → accept in a second browser context → turns green, duplicate refusal, disable |
| `backup` | export, **no plaintext in the file**, delete everything, restore, confirm it still decrypts |
| `safety-and-settings` | plain-language safety screen, interval reaching the engine, the 6-month cap enforced server-side, pause and resume |
| `handover` | release follows the owner's cycle rather than a hardcoded year |
| `navigation` | every drawer destination resolves, an unknown address gets the reassuring not-found page, and **no screen renders dark surfaces inside the light shell** |
| `security` | another account cannot see or read this one's notes, locking asks for Face ID again, and the vault key never reaches the server |
| `attachments` | a file survives save and reopen, never reaches the server in the clear, and can be removed without losing the note |
| `localisation` | switching country re-labels the tree, hides market-specific sections, and **never makes a note unreachable** |
| `email` | the invitation really is sent, the ladder goes out **once** however often the safety screen is read, a paused account is not chased, and no API key is ever served |
| `billing` | an unsigned or tampered webhook changes nothing, a genuine one is accepted **once**, and no credential is ever served |

### Shared state between specs

The app keeps everything in one in-memory store, so specs would otherwise leak
into one another. Each resets it via `POST /api/test/reset`, which returns 404
unless `VIRASAT_E2E=1` — set only by the Playwright config. Workers are pinned
to 1 so two specs cannot reset each other mid-run.

If an e2e run fails in a way that makes no sense, check for a stray `next start`
on port 3399 without `VIRASAT_E2E=1`: `reuseExistingServer` will adopt it, and
the reset endpoint will 404.

---

## 🚧 Known gaps

Three defects stand between this and a product you could honestly sell as
zero-knowledge. They interact, so read all three before fixing any.

**1 · A beneficiary cannot read the notes left to them.** `saveNote()` encrypts
the payload with the *owner's* master key, then mints a chest key that encrypts
nothing and seals that to the beneficiary. They end up holding a key that opens
nothing. This predates the UI overhaul — the same shape is in the original
`AddVaultItemModal`. The fix is to encrypt the payload with `K_chest` and wrap
`K_chest` twice: once to the owner's `K_master`, once to the beneficiary's
public key. Pinned by `handover.spec.ts` (`test.fixme`).

**2 · A wrong passphrase still reveals note titles.** `VaultItemRecord.title` is
stored as plaintext. For this product a title — "Bank locker", "Will — Mr
Sharma" — is often as revealing as the body. The fix is to move the title inside
the encrypted payload and decrypt the list client-side. Pinned by
`security.spec.ts` (`test.fixme`).

**3 · The server holds every beneficiary's RSA private key.** `/beneficiaries`
generates the key pair in the browser and posts **both halves** to
`POST /api/beneficiaries`, which stores the private key and hands it back to any
caller of `GET /api/beneficiaries`. The field is commented as demo convenience,
The handover design in `docs/authentication.md` §7 removes beneficiary key
pairs altogether (a password-protected PDF and a code rebuilt from a Witness
and a Beneficiary piece), which is the planned fix.

This one is not independent: **fixing defect 1 while this stands makes things
worse, not better.** Once the payload is sealed to `K_chest` and `K_chest` is
sealed to the beneficiary's public key, a server that also holds the matching
private key can decrypt every released note — and the architecture would *look*
sound while being fully readable server-side. The private key has to move to the
beneficiary (shown once, never stored) in the same change, or ahead of it.

Defects 1–3 all change the stored payload format, so they are best done as one
piece of work.

### Not yet built

- **The native app** (Capacitor, Keychain / Keystore, real Face ID) and the
  real **Apple, Google and Facebook** drivers — phases 2–4 of
  `docs/authentication.md`. The browser build runs the whole flow on a harness.
- **Handover by email** (phase 3b). Nothing delivers notes to a beneficiary
  yet; `/claim` says how it will work.
- **The store is in-memory** (`lib/state/mockDatabase.ts`, `lib/auth/store.ts`)
  and resets on restart, which now also signs everyone out. Persistence is the
  next step; both classes are the seam to put it behind.
- **Phase 5 hardening:** per-IP rate limits (limits today are per account and
  per device), a device list with remote removal in Settings, and changing the
  password from Settings.
- **SMS and WhatsApp are still simulated.** Email is wired up (see
  [Email](#-email)); the other two channels are not.

### Untested flows

Known blind spots, in rough order of what they would catch:

- Adding and removing a beneficiary through the UI.
- The security log rendering real entries.
- The notes-list filter chips.
- Forgetting a single backup-history entry.
- The encryption-key reveal on `/beneficiaries`.
- The `VIRASAT_E2E` gate's 404 path. `/api/scheduler` and `/api/test/reset` were
  verified by hand against a plain production build (both 404, `/api/heartbeat`
  unaffected), but Playwright cannot unset the server's own environment and
  ts-node will not resolve the `@/` alias in a route import, so neither suite
  covers it automatically.
- Desktop viewport — every spec runs at 390×844.
- Accessibility. There is no axe pass, and several screens (`AppShell`,
  `UnlockScreen`, `/audit`, `/claim`, `/settings`, `/welcome`) carry no
  `aria-label` at all.
- Network-failure paths — a dropped request mid-save.
- Any browser but Chromium.

### Recently closed

- `generateNotificationsForElapsedDays()` was pinned to the 365-day day numbers
  while the phase badge was already proportional, so a user on a 6-month cycle
  could sit in Phase 1 while the log claimed nothing had been sent. Now derived
  from the cycle, with scenarios at 183/365/548/730 days.
- **There was no authentication**: every API route was open, and one server
  held one shared vault. Now every route needs a two-tier session and reads
  the caller's own vault (`vaultFor`), and the pre-filled passphrase and the
  Face ID button that only submitted it are gone.
- `POST /api/scheduler` — an unauthenticated remote "release my vault now"
  button — is now gated behind `VIRASAT_E2E`.
- Trusted-friend invite tokens came from two `Math.random()` draws. They are now
  32 bytes from `node:crypto`.
- The crypto modules logged the full salt and a 16-hex-character prefix of
  `K_master` to the console on every unlock, in production. All crypto logging
  now goes through `lib/crypto/log.ts`, which no-ops outside development and
  logs only shapes — pinned by a scenario that fails if any key material
  reappears.
- There were no error boundaries, so a thrown error showed this audience Next's
  own error page.

---

## 🛠️ Technology stack

- **Framework:** Next.js 16.3 (App Router, Turbopack)
- **Library:** React 19.2, TypeScript 5 (strict)
- **Styling:** Tailwind CSS v4 — `@import "tailwindcss"` with `@theme inline`,
  design tokens in `app/globals.css`
- **Motion:** Framer Motion
- **Icons:** Lucide React
- **Cryptography:** WebCrypto (AES-256-GCM, PBKDF2, RSA-OAEP)
- **Tests:** Cucumber (logic) + Playwright (end-to-end)

### Next.js 16 conventions that will bite you

This is not the Next.js most training data describes. Before writing code, read
the relevant guide in `node_modules/next/dist/docs/`. In particular:

- `params` and `searchParams` are **Promises**. In a client component, unwrap
  them with React's `use()`.
- `useSearchParams` requires a Suspense boundary. This app mostly uses path
  segments instead; `/welcome/sign-in` wraps its one use in `<Suspense>`.
- The React Compiler lint rules are on: no `Date.now()` during render
  (`react-hooks/purity`), and no `setState` in an effect
  (`react-hooks/set-state-in-effect`). For localStorage-backed state the app
  uses `useSyncExternalStore` — see `lib/recents.ts`, `lib/auth/kitReminder.ts`,
  `lib/locale/LocaleProvider.tsx`, `lib/vault/backup.ts`.
- `viewport-fit=cover` is set deliberately. Without it, `env(safe-area-inset-*)`
  resolves to 0 and the layout letterboxes away from the notch.
- `app/error.tsx`, `app/not-found.tsx` and `app/global-error.tsx` exist so a
  thrown error never shows this audience a stack trace or a bare "Application
  error". `global-error.tsx` renders its own `<html>` and cannot use the design
  tokens, so its styles are inline on purpose — keep them in step with
  `app/globals.css` by hand.

---

## 🚀 Quick start

### Prerequisites
- Node.js 20.x or later
- npm

### Installation

```bash
git clone https://github.com/sayanb90/Virasat.git
cd Virasat
npm install
npm run dev          # http://localhost:3000
```

Next 16 allows only one dev server per directory. If a second refuses to start,
kill the first by the PID it printed.

### Production

```bash
npm run build
npm run start
```

### Device harness

The mobile device frame used to live in this repo. It is now a standalone app at
[sayanb90/simulationLab](https://github.com/sayanb90/simulationLab), which frames
any URL in an iframe — so it works for any project, in any framework, not just
this one. Run the harness and point it at `http://localhost:3000`.

---

## 📜 License

MIT.
