# Development plan

**Status as of 24 October 2026.** One page for where Virasat is and what comes
next. The designs behind it are:

- [`authentication.md`](authentication.md): sign-in, device unlock, recovery,
  handover by email.
- [`release-and-entitlement.md`](release-and-entitlement.md): when the vault
  opens, entitlement and billing.

This file says what is **built**, what is **decided but not built**, and the
**order** to build the rest in. When a phase lands, move it from "Next" to
"Done" and update the design doc's status line.

---

## 1. Done

### Before this branch (on `main`)

- Notes encrypted on the device (AES-256-GCM, attachments included), the
  category tree with India and International vocabulary, backup and restore.
- The check-in cycle and escalation ladder at any cycle length, vacation mode
  with a 6-month cap and the paused days credited back.
- Trusted Friends: invite by email, accept by link.
- Email delivery behind a driver (console / Resend / SendGrid), sent at most
  once, never carrying key material.
- Billing behind a driver (stub / Razorpay), with signature-verified,
  replay-safe webhooks. Not yet applied to accounts.

### On `authenticationEntitlements`: authentication phase 1

| Commit | What |
| :--- | :--- |
| `docs: plan sign-in…` | `authentication.md`, and the release rule revised in `release-and-entitlement.md` |
| `feat(auth): server-side…` | Accounts, sessions, device unlock and recovery on the server |
| `feat(auth): sign-in… screens` | The app side, the screens, and the test suites moved to accounts |

**Sign-in, as built**

- **Two tiers, checked by the server.**
  - *Tier one*: email and password, or Apple / Google / Facebook. This gives a
    *pending* session.
  - *Tier two*: Face ID or the PIN on a phone already set up, or a code emailed
    to the account on a new phone. This gives a *full* session.
  - A pending session gets 403 from every Owner route.
- **One password.** The device derives `K_auth`, a login proof the server
  stores only as a slow hash, and `K_wrap`, which never leaves the device.
- **`K_vault`.** It is random and encrypts every note. Only wrapped copies are
  stored: by the password, by the Recovery Kit, by the phone's Face ID key,
  and by the phone's PIN key.
- **PIN.**
  - The PIN key needs a share from the phone *and* a share the server releases
    only for the right PIN.
  - Five wrong PINs delete the server's share. After that, only the password
    brings that phone back.
- **Sessions.**
  - Access tokens last 15 minutes and are kept in memory.
  - Refresh tokens last 30 days and rotate on every use. Presenting one twice
    ends that sign-in everywhere.
  - A refresh brings back only a pending session, so Face ID or the PIN is
    asked on every cold start, after 5 minutes in the background, and after
    "Lock now".
- **Social sign-in.**
  - Only name and email are taken from the provider.
  - A social account never links to an existing account on email alone: the
    password is asked first.
  - On a phone not yet set up, a social sign-in still needs the password,
    because the vault key cannot be opened without it.
- **Forgotten password.**
  - *Path A*, on a phone already set up: Face ID or PIN, plus an emailed code.
  - *Path B*, with the Recovery Kit: an emailed code, the kit's code, then a
    72-hour hold. The Owner can stop it with one tap from an email. The kit is
    spent on use and a new one issued.
- **Every API route** calls `requireSession` or is on a commented public
  allow-list (`lib/auth/http.ts`). `e2e/auth.spec.ts` walks `app/api/` and
  fails if any other route answers without a session.
- **Per-account vaults.** `vaultFor(userId)` replaces the single shared store.
  The seeded demo beneficiary is gone, and the check-in ladder goes to the
  signed-in account instead of `OWNER_EMAIL`.
- **No account enumeration.**
  - An unknown email gets a stable fake salt.
  - A wrong password and an unknown email get the same answer.
  - Signing up with an existing email sends "you already have an account"
    instead of a code.

**Where it lives**

| Concern | Files |
| :--- | :--- |
| Rules (pure functions, tested without HTTP) | `lib/auth/flows.ts` |
| Records and in-memory store | `lib/auth/types.ts`, `lib/auth/store.ts` |
| Route guard and allow-list | `lib/auth/http.ts` |
| Social provider driver (stub only) | `lib/auth/providers/` |
| Key hierarchy, Recovery Kit codes, PIN key | `lib/crypto/keys.ts`, `lib/crypto/account.ts` |
| What a phone holds | `lib/device/core.ts` (logic), `lib/device/bridge.ts` (storage: browser harness) |
| App-side session | `lib/auth/client.ts` |
| Screens | `app/welcome/sign-in`, `app/welcome/recover`, `components/auth/`, `components/UnlockScreen.tsx` |
| Tests | `features/10_authentication.feature` (25 scenarios), `e2e/auth.spec.ts` (11 flows) |

**Test status at the last commit:** Cucumber 95/95. Playwright 84 passed and
2 skipped on purpose (note titles are still plaintext; the email handover is
not built).

**Deliberate changes to watch for**

- `/claim` no longer opens notes. It read the Owner's vault without signing
  in, which accounts make impossible. It now explains email delivery.
  **Nothing delivers notes to a Beneficiary until phase 3b.**
- The browser build is a **harness, not the product**. Device keys live in
  IndexedDB and "Face ID" is a button, but the server still checks the
  biometric key's signature. The stub social provider is refused in a
  production build unless `VIRASAT_E2E=1`.

---

## 2. Decided, not yet built

Settled in review on 24 October 2026. Details are in the linked sections.

| Decision | Where |
| :--- | :--- |
| Android and iOS only, through a native wrapper (Capacitor). The browser build stays as a dev and test harness. | `authentication.md` §7 |
| Notes reach Beneficiaries **by email only**: a password-protected PDF, and the handover code in a separate email | `authentication.md` §7 |
| One handover code per Owner, rebuilt only at release from a server piece, a Witness piece and a Beneficiary piece. Both family pieces are sent from the Owner's **own** mailbox, never Virasat's. | `authentication.md` §7 |
| Release = **one Witness confirmation + one Beneficiary confirmation + a 14-day cooling-off window** with the Owner's veto. No death-certificate route. | `release-and-entitlement.md` §5 |
| One or two Witnesses, never more. Any number of Beneficiaries. | `release-and-entitlement.md` §3 |
| Beneficiaries and Witnesses need no Virasat account; they prove their email with a code | `authentication.md` §7 |
| A Recovery Kit recovery is held for 72 hours | `authentication.md` 3.6 |
| A tap re-asks for Face ID / PIN on cold start, after 5 minutes away, and on "Lock now" | `authentication.md` §4 |

---

## 3. Next, in order

Each phase should leave both test suites green and be reviewable on its own.

### Phase 2: static export and the API split

The native app ships its UI inside the bundle, so the app has to build as a
static export, with `/api` deployed separately.

- Turn the four dynamic routes into static ones:
  - `notes/[subcategoryId]` gets `generateStaticParams`, since the taxonomy is
    fixed.
  - Note ids and invite tokens move to query strings
    (`/notes/view?id=`, `/trusted-friends/accept?token=`).
- `app/page.tsx` redirects on the client, not with server `redirect()`.
- Two builds from one repo: the **app** (`output: "export"`) and the **API**
  (the same Next app, serving `/api` only). CORS allows exactly
  `capacitor://localhost` and `https://localhost`.
- `apiFetch` takes an API base URL from configuration.
- The one public page Witnesses and Beneficiaries tap ("Confirm that Ramesh
  has passed away") is served by the API host.
- **Done when:** Playwright runs against the static build talking to a local
  API.

### Phase 3: the Capacitor shell

- iOS and Android projects in the repo, built from the static export.
- **A native device bridge** implementing `DeviceBridge`
  (`lib/device/bridge.ts`), written as our own small plugin:
  - iOS: Keychain items with `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`.
    The biometric key and wrap key go in the Secure Enclave with
    `.biometryCurrentSet`.
  - Android: Keystore keys with `setUserAuthenticationRequired`, used through
    `BiometricPrompt` with a `CryptoObject`, on StrongBox where available.
  - When someone adds a new face or fingerprint, the stored key is
    invalidated, and the app falls back to the PIN with an explanation.
- The refresh token and recovery token go in the Keychain / Keystore, not
  IndexedDB.
- Hide the app's contents in the app-switcher snapshot.
- Exclude the browser bridge from the native build.
- **Done when:** sign-up, unlock, the PIN and both recovery paths pass in the
  iOS Simulator (*Features → Face ID*) and the Android emulator.

### Phase 3b: handover by email

This replaces Beneficiary key pairs and fixes defects 1 and 3 in the README.

- The phone builds each Beneficiary's PDF from their assigned notes, encrypts
  it with the handover code (AES-256), and uploads it. It rebuilds the PDF
  whenever those notes change, and shows "Family copy up to date ✓".
- **The three code pieces.**
  - The server stores its piece.
  - The phone opens the Owner's mail app with a pre-written email for each
    Witness and Beneficiary. The piece travels after the `#` in the link.
  - The phone keeps its own copy of the code, wrapped by `K_vault`.
- **The release state machine** from `release-and-entitlement.md`:
  1. A Witness confirms, which hands over the Witness piece.
  2. A Beneficiary confirms, which hands over the Beneficiary piece.
  3. The 14-day cooling-off window runs, with dated warnings to the Owner on
     every channel and a one-tap veto.
  4. Delivery: every Beneficiary gets two emails, the PDF and then the code.
     The server deletes all pieces.
- **Rotation.** Removing a Witness or Beneficiary creates new pieces, rebuilds
  the PDFs, and sends fresh emails.
- **The yearly "check it still works".** The holder's page hashes their piece
  on their device and sends only the hash.
- Allow at most two Witnesses, and rename Trusted Friend → Witness (phase 0 of
  the release doc) in the same change.
- **THE RULE in `lib/email/templates.ts` must be revised deliberately.** The
  handover-code email is the one email that carries a secret. Update the rule,
  its comment and `features/08_email_delivery.feature` together.
- Retire `/claim` once nothing links to it.
- **Done when:** the `handover.spec.ts` fixme passes. A Beneficiary receives
  both emails and opens the PDF with the code.

### Phase 4: real social providers

- Server drivers behind `AUTH_PROVIDERS_DRIVER=native`:
  - **Apple and Google:** verify ID tokens against their JWKS with `jose`,
    checking `iss`, `aud`, `exp` and our `nonce`.
  - **Facebook:** `debug_token`, then `/me?fields=name,email`.
- Native sign-in sheets in the app.
- Apple sends the name only on the first authorization, so capture it then.
  Facebook may send no email at all; that path already exists.
- **Done when:** each provider signs up and signs in with real test accounts.

### Phase 5: hardening

- Per-IP rate limits on login, codes, PINs and recovery. Today's limits are per
  account and per device.
- In Settings: a device list with remote removal, change password (re-wrapping
  `K_vault`), and an "active recovery" banner with a cancel button.
- Push notifications for the recovery hold and the release veto, alongside
  email.
- Raise the KDF to Argon2id via WebAssembly.

### Alongside the phases

- **Persistence.** Accounts, sessions and vaults are in memory, so a restart
  signs everyone out. This is required before anything is deployed. The seams
  are `lib/auth/store.ts`, `lib/state/mockDatabase.ts`, `lib/email/outbox.ts`
  and `lib/billing/ledger.ts`. Set `AUTH_SERVER_SECRET` once it lands.
- **Note titles in plaintext** (defect 2). Move the title inside the encrypted
  payload. Pinned by a `test.fixme` in `security.spec.ts`.
- **Entitlement** (`release-and-entitlement.md` phases 1 and 3): apply billing
  events to accounts, with "uncertainty resolves to hold".

---

## 4. Prerequisites outside the code

These are needed before phases 3–4 can be finished:

- Apple Developer Program membership.
- Google Cloud OAuth client ids for iOS, Android and the server.
- A Meta developer app, with app review for the `email` permission.
- A domain with HTTPS for the API.
- App Store privacy labels and the Play data-safety form. We collect name and
  email only.

---

## 5. Open questions

- **Witness confirmation identity.** Is a verified email plus the cooling-off
  window enough for v1? (`release-and-entitlement.md` §10, question 8.)
- **Long-stop.** How long do we hold an account where nobody ever responds?
  The proposal is five years. (`release-and-entitlement.md` §10, question 6.)
- **Price points and gateway.** (`release-and-entitlement.md` §10, questions
  2, 3 and 7.)
