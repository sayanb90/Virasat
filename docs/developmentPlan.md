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

### On `authenticationEntitlements`: phase 2, the static export and the API split

- **Two builds from one repo**, chosen by `BUILD_TARGET` in `next.config.ts`:
  - `app`: a static export to `out/`. `pageExtensions: ["tsx"]` removes every
    route handler (`route.ts`) and the proxy (`proxy.ts`) from this build
    without moving a file. Every routing file outside `app/api/` is `.tsx`
    and must stay so.
  - `api`: the same app as the API host. `proxy.ts` answers CORS and 404s the
    app's screens.
- **The four dynamic routes** are static now:
  - A subcategory is `/notes/category?sub=…` and its new-note page
    `/notes/new?sub=…`. Subcategory ids are known at build time, but they
    contain dots (`banks.nominees`), and the native shell's local server
    reads a dotted last segment as a file name, so a reload there would find
    nothing. Every app path is extensionless. (A first cut used
    `generateStaticParams`; phase 3 replaced it.)
  - A note is `/notes/view?sub=…&id=…`. `sub` is carried as well as `id`
    because the breadcrumb is drawn before the note loads.
  - An invitation is `/trusted-friends/accept?token=…`.
  - Built in one place: `lib/routes.ts`.
- `app/page.tsx` redirects on the client.
- **`apiFetch` takes its base from `NEXT_PUBLIC_API_BASE`** (`lib/config.ts`).
- **CORS** allows exactly `capacitor://localhost` and `https://localhost`,
  plus `CORS_ALLOWED_ORIGINS` for the test harness only. Sessions are bearer
  tokens, so no credentialed CORS is needed. A foreign origin's preflight
  gets 403.
- **The API host also serves the email-link pages**: the Trusted Friend
  invitation and the recovery veto (`/welcome/recover/cancel`). The plan only
  named the future Witness confirm page, but these two have the same problem:
  the person opening them has no app. They are listed in `proxy.ts`; add the
  confirm page there in phase 3b.
- **Fixed on the way:** the invite link shown in the app was built from
  `window.location.origin`, which inside the native app is
  `capacitor://localhost`. It now points at the web host (`publicWebUrl`).
- **Tests:** `npm run build:e2e-split && npm run test:e2e:split` runs the
  whole Playwright suite against the static export on one origin and the API
  on another (`scripts/serve-static.mjs`, no new dependency). CI now runs this
  topology. Both topologies pass: 84 passed, 2 skipped on purpose.

### On `authenticationEntitlements`: phase 3, the native shell (built, not yet run on a phone)

- **iOS and Android projects** (`ios/`, `android/`), Capacitor 8, from
  `capacitor.config.ts`. `NEXT_PUBLIC_API_BASE=https://api… npm run
  build:native` exports the app with `NEXT_PUBLIC_NATIVE=1` and copies it into
  both. The build refuses to run without an API base. App id
  `com.virasat.app`: **confirm it before the first store upload**, as it can
  never change after.
- **Every app path is extensionless.** Capacitor's local server serves the
  root `index.html` for any path whose last segment has no dot, and treats a
  dotted one as a file. Subcategory ids have dots (`banks.nominees`), so a
  reload on `/notes/banks.nominees` would have been a blank screen. A
  subcategory is now `/notes/category?sub=…` and a new note
  `/notes/new?sub=…`, alongside `/notes/view?sub=…&id=…`.
- **Full reloads go to the root.** Any full load in the shell is served the
  root page whatever the URL (iOS reloads the web view after reclaiming its
  memory), and hydrating it under another URL is a React mismatch. The native
  build's root layout bounces to `/` before React starts. The vault key was
  lost with that memory anyway, so the next screen is unlock either way.
  Checked under Capacitor's exact rules (`node scripts/serve-static.mjs out
  <port> --capacitor`): every deep reload lands on unlock, with no errors.
- **Key operations moved behind `KeyOps`** (`lib/device/keyops.ts`). On a
  phone the private keys never reach JavaScript, so it cannot sign or unwrap;
  it can only ask. `core.ts` takes the `KeyOps` to use and defaults to the
  browser's, so the existing specs run the same functions.
- **One prompt per unlock, owned by the key.** Face ID is no longer a
  separate call before the crypto: using the biometric keys is what shows it,
  once, for both the server's challenge and this phone's copy of `K_vault`.
- **`VirasatDevice`, our own plugin**, with `lib/device/native.ts` as its
  JavaScript side (formats documented there):
  - **iOS** (`ios/App/App/VirasatDevicePlugin.swift`): three Secure Enclave
    P-256 keys. Signing has no gate; the biometric signing key and the wrap
    key use `.biometryCurrentSet`. K_vault is wrapped with ECIES to the wrap
    key's public half, so enrolment needs no second prompt. One `LAContext`
    is evaluated and handed to both key lookups. Storage is Keychain items,
    `WhenUnlockedThisDeviceOnly`; this plan said `WhenPasscodeSet…`, but that
    would stop a phone without a passcode from saving anything, including
    for the PIN, so it was not used. The first launch after an install clears
    the previous install's Keychain items, which iOS keeps across uninstalls.
  - **Android** (`…/VirasatDevicePlugin.java`, Java to match the generated
    project): Keystore keys, StrongBox when the phone has it. The biometric
    keys are `AUTH_BIOMETRIC_STRONG` and time-bound (10 s) rather than bound
    to a `CryptoObject`, because a prompt carries only one `CryptoObject` and
    unlocking needs two keys. The wrap key is RSA-OAEP, so wrapping needs no
    prompt. Biometrics need Android 11; older phones use the PIN. Stored
    values are AES-GCM encrypted under a Keystore key. Backup and
    device-to-device transfer are off.
  - **A new face or fingerprint invalidates the biometric keys.** The plugin
    reports `BIOMETRICS_CHANGED`; the app forgets Face ID on this phone,
    explains, and offers the PIN. *Settings → Signing in → Turn on Face ID*
    sets the phone up again from the open vault (also new: before this, a
    phone set up without Face ID could never turn it on).
  - Re-enrolling deletes the previous enrolment's hardware keys.
- **App-switcher snapshot hidden**: a cover view on iOS
  (`VirasatBridgeViewController.swift`), `FLAG_SECURE` on Android (this also
  blocks screenshots).
- **The browser bridge is not in the native bundle**, checked by building
  both and searching the output. The native bundle has no IndexedDB fallback.
- The unlock and set-up screens say "Touch ID", "fingerprint" and so on, as
  the phone reports. Prose elsewhere still says "Face ID".

**What is verified, and what is not.** This was built where neither Xcode nor
the Android SDK can run.

| Check | Status |
| :--- | :--- |
| `lib/device/native.ts` against a fake plugin with the real formats (DER signatures, X9.63 points, opaque wrap blobs): enrolment, Face ID, PIN, a new face, cancelling, forgetting the phone, 300 signatures through the server's own check | Cucumber, `features/11_hardware_device_keys.feature` |
| The Java plugin compiles against the Android 15 framework (androidx and Capacitor stubbed) | Done once by hand, `javac` |
| The Java plugin's point encoding and DER signatures verify through `native.ts` and the server's check; its OAEP parameters round-trip | Done once by hand on a JVM (40 keys) |
| Both apps compile against the real SDKs | CI, `.github/workflows/native.yml`, on the first push |
| The Swift plugin | **Not compiled here.** CI's iOS job is its first compile. |
| Anything on a phone or emulator | **Not done.** The checklist below. |
| The browser harness still runs every flow | Playwright, both topologies: 85 passed, 2 skipped. Cucumber: 102 scenarios. |

**Device checklist** (the phase's "done when"). In the iOS Simulator, set
*Features → Face ID → Enrolled*; in the Android emulator (API 30+), enrol a
fingerprint in Settings and use *Extended controls → Fingerprint*.

1. Sign up. Face ID is offered; the system asks permission once (iOS).
2. Close and reopen the app: one prompt unlocks it. Cancel: the PIN works.
3. Wrong face or finger, then cancel: nothing is signed, the PIN works.
4. Add a face or fingerprint in Settings. Reopen: a clear message, PIN only,
   no Face ID button. Turning Face ID on again works.
5. Recovery path A (this phone) and path B (Recovery Kit, 72-hour hold, the
   veto link) both complete.
6. The app switcher shows the cover (iOS), a blank card (Android).
7. iOS: in Xcode, *Debug → Simulate memory warning*, or kill the web content
   process; the app returns to unlock without a blank screen.
8. Uninstall and reinstall: the app starts signed out.
9. Android: `adb backup` / a device transfer carries nothing.

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

### ~~Phase 2: static export and the API split~~ — done, see §1.

### Phase 3: the Capacitor shell — built, see §1. Remaining:

- **Run the device checklist** in §1 on the iOS Simulator and the Android
  emulator, then on one real iPhone and one real Android phone. Android's
  time-bound keys need checking in particular: that one prompt unlocks both,
  and that a new fingerprint invalidates them.
- **Emails that link to app screens.** The check-in ladder and other Owner
  emails link to `/heartbeat`, `/settings` and `/claim`. The API host 404s
  app screens, so those links need **universal links (iOS) and app links
  (Android)** that open the installed app, served from the API host's
  `/.well-known/`. Until then they reach a 404.
- App icons and splash screens (the generated projects use Capacitor's).
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
