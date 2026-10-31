# Runbook: what is built, and how to take it live

**Last updated:** 24 October 2026, at commit `4a03a72` on `authenticationEntitlements` (PR #6).

This file answers two questions:

1. **What exists today**, and how far each part has been checked.
2. **What it takes to put Virasat in front of real people**, in order, with
   every account, setting and command.

The design behind each part is in [`authentication.md`](authentication.md) and
[`release-and-entitlement.md`](release-and-entitlement.md). The order of work
is in [`developmentPlan.md`](developmentPlan.md). This file is the operational
view of both.

### Keeping it current

- **Any change that alters what ships, or how it is deployed, updates this
  file in the same pull request.** That covers a new setting, a new external
  service, a new build step, or a status changing from "built" to "verified on
  a device".
- Change the status rows in §1, and the steps in §4–§7 they affect.
- Add a line to the change log (§10).
- Bump the "Last updated" line above.
- Never put a secret's value here. Name the setting and say where it is kept.

---

## 1. Status at a glance

Legend:
- ✅ verified: automated tests pass and, where it applies, it has run on a device or service.
- 🟡 built, not verified where it matters: it passes every check here, but has not run on a device or against the real service.
- ❌ not built.

### The product

| Part | Status | Where | What is missing |
| :--- | :--- | :--- | :--- |
| Encrypted notes, attachments, categories (India + international) | ✅ | `lib/vault`, `lib/crypto`, `lib/taxonomy` | |
| Backup export and restore | ✅ | `lib/vault/backup.ts` | |
| Trusted Friends (invite, accept, disable) | ✅ | `app/trusted-friends` | The rename to Witness (`release-and-entitlement.md` §3) |
| Check-in ladder and escalation emails | 🟡 | `lib/state/heartbeatMachine.ts`, `lib/email/dispatch.ts` | **Runs on a simulated clock.** No scheduled job yet (§2, blocker 2) |
| Release to Beneficiaries (handover by email) | ❌ | | Phase 3b. Nothing delivers notes to anyone yet |
| Entitlement (what a lapsed subscription does) | ❌ | `release-and-entitlement.md` | Billing events are not yet applied to accounts |
| Billing (Razorpay) | 🟡 | `lib/billing` | Test-mode and live keys; a webhook registered with Razorpay |

### Signing in and the device (phases 1, 3, 4, 5)

| Part | Status | Where | What is missing |
| :--- | :--- | :--- | :--- |
| Email + password, two-tier sign-in, both recovery paths | ✅ | `lib/auth` | |
| Argon2id for passwords; older accounts upgraded at next sign-in | ✅ | `lib/crypto/kdfPolicy.ts`, `lib/crypto/keys.ts` | |
| Per-network rate limits | ✅ | `lib/auth/rateLimit.ts` | `CLIENT_IP_HEADER` and `TRUSTED_PROXY_HOPS` set for the real host |
| Change password, your phones, recovery banner | ✅ | `app/settings`, `components/settings` | |
| iOS and Android apps (Capacitor 8) | 🟡 | `ios/`, `android/` | Compiled in CI; never run. The device checklist (§6.5) |
| Keys in Secure Enclave / Keystore, one-prompt unlock, PIN fallback | 🟡 | `lib/device/native.ts`, `VirasatDevicePlugin.swift/.java` | The device checklist. Android's one-prompt unlock most of all |
| Apple, Google, Facebook sign-in | 🟡 | `lib/auth/providers/native.ts`, `lib/auth/socialSheets.ts` | Provider accounts (§3); one sign-up and sign-in each on a device |
| Sign in with Apple on Android | ❌ | | An Apple Services ID and a redirect endpoint on the API host |
| Push alerts (recovery started) | 🟡 | `lib/push` | APNs key, Firebase project; one real alert on each platform |
| Universal / app links for Owner emails | ❌ | | Emails linking to `/heartbeat`, `/settings`, `/claim` reach a 404 on the API host |
| App icons and splash screens | ❌ | `ios/App/App/Assets.xcassets`, `android/app/src/main/res` | Capacitor's defaults are still in place |

### Platform

| Part | Status | Where | What is missing |
| :--- | :--- | :--- | :--- |
| Static app build + separate API host | ✅ | `next.config.ts`, `proxy.ts` | |
| CORS for the apps' origins only | ✅ | `proxy.ts` | |
| Email (Resend / SendGrid) | 🟡 | `lib/email` | A provider account, a verified sending domain |
| **Persistence** | 🟡 | `lib/persistence/snapshot.ts`, `instrumentation.ts` | With `DATA_FILE` set, every store is saved to one JSON file and loaded at start. For development and demos only: no database yet (§2, blocker 1) |
| Mock data | ✅ | `lib/dev/mockDb.ts`, `scripts/mock-db.ts` | `npm run db:mock` (§8.1) |
| Tests and CI | ✅ | `tests/unit`, `features`, `e2e`, `.github/workflows` | |

---

## 2. Blockers before any real user

None of these can be configured away. Each one is code to write first. Until
all are done, run Virasat only with test data.

1. **Persistence.** Accounts, sessions, vaults, the email outbox, billing and
   push tokens live in memory. `DATA_FILE` saves them all to one JSON file
   (every 2 seconds when something changed, and on shutdown) and loads it at
   start, so a restart keeps everyone signed in. That is enough for
   development and demos, not for users:
   - one server process only; two would overwrite each other's file;
   - the whole file is rewritten on every save;
   - up to 2 seconds of changes are lost if the process is killed;
   - no backups, and the file is readable by anyone with the disk.
   The vaults themselves stay ciphertext in the file. Rate-limit counters are
   not saved; a restart resets them.
   The seams for a database are `lib/auth/store.ts`,
   `lib/state/mockDatabase.ts`, `lib/email/outbox.ts` and
   `lib/billing/ledger.ts`. Once it lands, set `AUTH_SERVER_SECRET` (§4.1) and
   never change it.
2. **A real clock for the check-in ladder.**
   - `heartbeatMachine` and `dispatchDueEmails` work from
     `simulatedElapsedDays`, which only tests move.
   - Production needs elapsed time computed from `lastCheckInDate`.
   - It also needs a scheduled job (at least daily) that runs the dispatcher
     for every Owner. `/api/scheduler` is the test time-machine. It must stay
     404 in production; it is not that job.
   - The dispatcher sends every step that is past due at once. An Owner who
     is first seen late in the ladder (the mock "released" Owner, or anyone
     after an outage of the job) gets every reminder in one burst. The job
     should send only the latest step due and mark the earlier ones as
     skipped.
3. **Release delivery** (phase 3b). Today nothing reaches a Beneficiary.
4. **Entitlement.** What a lapsed subscription does must be applied, with
   "uncertainty resolves to hold" (`release-and-entitlement.md` §4).
5. **Upgrade Next.js.** The installed `next` (16.0–16.4 range) has critical
   advisories, including remote code execution in the image optimiser and
   `next/og`. Check with `npm audit --omit=dev`.
6. **The device checklist** (§6.5), on the iOS Simulator and an Android
   emulator, then one real phone of each.
7. **Confirm the app id `com.virasat.app`.** It cannot change after the first
   store upload.

Known gaps that are not blockers, but should be closed before a wide launch:
- Universal/app links for Owner emails.
- Sign in with Apple on Android.
- Alerts for the release veto (waits on blocker 3).
- Real icons.

---

## 3. Accounts and credentials to obtain

Get these early: several involve review queues.

| Service | What to set up | Gives you | Goes into |
| :--- | :--- | :--- | :--- |
| A domain + HTTPS hosting | API host on Node 22, e.g. `api.yourdomain.com` | The API, and the pages email links open | `NEXT_PUBLIC_API_BASE`, `APP_URL` |
| **Apple Developer Program** | Team; App ID `com.virasat.app` with the **Sign in with Apple** and **Push Notifications** capabilities; an APNs auth key (`.p8`) | Signing, TestFlight, App Store, Sign in with Apple, push | `APPLE_CLIENT_IDS`, `APNS_*` |
| **Google Cloud** | OAuth consent screen; OAuth client ids: **iOS** (bundle id), **Android** (package + the signing key's SHA-1), **Web** (the "server" id Android's sheet is given) | Google sign-in | `GOOGLE_CLIENT_IDS`, `NEXT_PUBLIC_GOOGLE_*`, `GOOGLE_IOS_URL_SCHEME` |
| **Meta for Developers** | An app with Facebook Login; **app review for the `email` permission**; the client token | Facebook sign-in | `FACEBOOK_*`, `NEXT_PUBLIC_FACEBOOK_*` |
| **Firebase** | A project with the Android app registered; `google-services.json`; a service account with the FCM role | Android push | `android/app/google-services.json` (not committed), `FCM_SERVICE_ACCOUNT_JSON` |
| **Email provider** (Resend or SendGrid) | An API key; the sending domain verified (SPF, DKIM, and ideally DMARC) | Codes, recovery notices, the check-in ladder | `EMAIL_DRIVER`, `EMAIL_FROM`, `RESEND_API_KEY` / `SENDGRID_API_KEY` |
| **Razorpay** | Account (KYC); API keys in test and live mode; a webhook to `https://<api host>/api/billing/webhook` | Payments | `BILLING_DRIVER`, `RAZORPAY_*` |
| **Google Play Console** | Developer account; app listing; the **data-safety form** | Android release | |
| **App Store Connect** | App record; the **privacy labels** (we collect name and email only) | iOS release | |

Keep every secret in the hosting platform's secret store or the CI's
encrypted secrets, never in the repository. `.env.example` lists each
setting with comments.

---

## 4. Configuration reference

**When** a setting is read matters. `NEXT_PUBLIC_*` settings are baked into the
app bundle when it is built; changing them means a new app build and a store
release. Everything else is read by the API host at runtime.

### 4.1 API host, runtime

| Setting | Production value | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Set by `next start`. Turns the stub sign-in driver off. |
| `APP_URL` | `https://<api host>` | Links in emails. The API host is the only web server. |
| `AUTH_SERVER_SECRET` | a long random value, fixed forever | Keys the fake salts for unknown emails. Changing it later reveals which emails had accounts. Set with persistence. |
| `EMAIL_DRIVER` | `resend` or `sendgrid` | `console` (default) prints and sends nothing. |
| `EMAIL_FROM` | `Virasat <hello@yourdomain.com>` | Must be on the verified domain. |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` | secret | The one matching the driver. |
| `AUTH_PROVIDERS_DRIVER` | `native` | Checks real Apple / Google / Facebook tokens. |
| `APPLE_CLIENT_IDS` | `com.virasat.app` | Comma-separated if a Services ID is added later. |
| `GOOGLE_CLIENT_IDS` | `<ios id>,<web id>` | Android's tokens carry the web id. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | secret | `FACEBOOK_GRAPH_VERSION` defaults to `v23.0`; Meta retires versions about every two years. |
| `PUSH_DRIVER` | `native` | `console` (default) logs only. |
| `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` | secret / `com.virasat.app` | `APNS_SANDBOX=1` only for development builds. |
| `FCM_SERVICE_ACCOUNT_JSON` | secret | The whole key file, as one value. |
| `BILLING_DRIVER` | `razorpay` | `stub` (default) moves no money. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | secret | Test and live mode have different values. |
| `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS` | to match the host | Default `x-forwarded-for`, `1`. If wrong, the per-network limits count the proxy (everyone shares one limit) or trust a forged address. |

**Must never be set in production:**
- `VIRASAT_E2E` opens the test routes (reset, codes, the clock and the scheduler time-machine) and lists every account's email outbox and billing ledger to any signed-in caller.
- `CORS_ALLOWED_ORIGINS` allows extra origins, for the test harness only.
- `STUB_WEBHOOK_SECRET`.
- `AUTH_PROVIDERS_DRIVER=stub`.

**Development and staging only:**
- `DATA_FILE` saves every store to this JSON file and loads it at start
  (§2, blocker 1). Unset, everything is in memory. If others can reach the
  server, set `AUTH_SERVER_SECRET` too: otherwise the fake salts change on
  every restart, which tells an observer which addresses are real.
- `EMAIL_REDIRECT_TO` delivers every email to this one address instead, with
  the intended recipient in the subject and the first line. The outbox still
  records who it was meant for. For a provider sandbox that sends only to
  its own account (Resend's `onboarding@resend.dev`), or a staging server
  with real-looking addresses.
- `SEED_INBOX`, `SEED_PASSWORD`: defaults for `npm run db:mock` (§8.1).

### 4.2 The app bundle, build time (`npm run build:native`)

| Setting | Value |
| :--- | :--- |
| `NEXT_PUBLIC_API_BASE` | `https://<api host>`. The build refuses to run without it. |
| `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google client ids. A provider without its id is not offered. |
| `NEXT_PUBLIC_FACEBOOK_APP_ID`, `NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN` | Meta app id and client token. |

`NEXT_PUBLIC_NATIVE=1` is set by the script itself; never set it by hand.

### 4.3 The iOS project, build settings

Set these in the App target in Xcode, or on the `xcodebuild` command line:

- `FACEBOOK_APP_ID`
- `FACEBOOK_CLIENT_TOKEN`
- `GOOGLE_IOS_URL_SCHEME`: the reversed iOS client id, `com.googleusercontent.apps.<…>`

Until `FACEBOOK_APP_ID` is set, the Facebook SDK never starts.

---

## 5. Deploying the API host

The same repository builds the API host (`BUILD_TARGET=api`). It serves `/api`,
plus the two pages a browser opens from an email:
- `/trusted-friends/accept`
- `/welcome/recover/cancel`

Every other app screen is a 404 there by design. The app itself ships inside
the phone.

1. **Prepare the host:** Node 22, HTTPS, the settings in §4.1 in its secret
   store.
2. **Build and start:**
   ```bash
   npm ci
   npm run build:api
   npm run start            # next start; put it behind the platform's proxy
   ```
3. **Set `TRUSTED_PROXY_HOPS`** to the number of proxies that append to
   `X-Forwarded-For` (usually 1). Use `CLIENT_IP_HEADER` if the platform
   names the client in another header (for example `cf-connecting-ip`).
4. **Register the Razorpay webhook** at `https://<api host>/api/billing/webhook`
   with `RAZORPAY_WEBHOOK_SECRET`.
5. **Run the smoke tests in §6.4.**
6. **Once blocker 2 lands,** schedule the check-in job (at least daily).

**To roll back:** redeploy the previous build. The apps keep working against
an older API as long as no route they call was removed. Before persistence,
any restart loses all data, so treat every deploy as a reset.

---

## 6. Releasing the apps

### 6.1 Build the web bundle into both projects

```bash
NEXT_PUBLIC_API_BASE=https://<api host> \
NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID=… NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=… \
NEXT_PUBLIC_FACEBOOK_APP_ID=… NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN=… \
npm run build:native        # static export + cap sync
```

### 6.2 iOS

1. `npx cap open ios`.
2. In Xcode, set the team and signing on the App target, and the build
   settings in §4.3.
3. Check that the Sign in with Apple and Push Notifications capabilities match
   the App ID. `App.entitlements` already declares both.
4. Archive, then upload to TestFlight.
5. Before review, fill in the privacy labels (name and email only; no
   tracking) and the Face ID usage reason (already in `Info.plist`).

### 6.3 Android

1. Put `google-services.json` in `android/app/`. It is not committed.
2. Create the upload key and set up Play App Signing. Register **both** the
   upload key's and Play's signing key's SHA-1 in the Google Android OAuth
   client, or Google sign-in will fail in release builds only.
3. `npx cap open android`, then build a signed App Bundle (`.aab`) and upload
   it to an internal testing track.
4. Fill in the data-safety form: name and email, encrypted in transit, no
   advertising id (the `AD_ID` permission is removed).

### 6.4 Smoke tests after every API deploy

```bash
API=https://<api host>
# The apps' origins get a preflight; anyone else does not.
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$API/api/auth/login" \
  -H 'Origin: capacitor://localhost' -H 'Access-Control-Request-Method: POST'   # 204
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$API/api/auth/login" \
  -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'    # 403
# App screens are not served here; the email-link pages are.
curl -s -o /dev/null -w '%{http_code}\n' "$API/notes"                            # 404
curl -s -o /dev/null -w '%{http_code}\n' "$API/trusted-friends/accept?token=x"   # 200
# The test routes are closed.
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/api/test/reset"           # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/api/scheduler"            # 404
# Up, and answering with Argon2id settings for an unknown address.
curl -s -X POST "$API/api/auth/prelogin" -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com"}'                                         # "algorithm":"argon2id"
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/auth/session"                 # 401 (up; no session)
```

### 6.5 The device checklist

The canonical list is in `developmentPlan.md` §1, phases 3 and 5. Run it on
the iOS Simulator (*Features → Face ID → Enrolled*) and an Android 11+
emulator with a fingerprint enrolled. Then run it on one real phone of each.
In short:

1. Sign up; Face ID / fingerprint is offered and works with one prompt.
2. Reopen the app, cancel the prompt, and check the PIN still works.
3. Add a face or fingerprint in the phone's settings. Expect a clear message
   and the PIN only. Settings can turn biometrics back on.
4. Both recovery paths complete. The Recovery Kit's 72-hour hold shows the
   banner, and the stop link works.
5. Apple (iOS), Google and Facebook each sign up and sign in.
6. Turn alerts on and start a recovery from another phone; the alert arrives
   and names nothing in the vault.
7. The app switcher shows the cover (iOS) or a blank card (Android).
8. After a reload under memory pressure (iOS), the app returns to unlock.
9. After uninstalling and reinstalling, the app starts signed out.
10. Remove a phone from another phone; its PIN stops working.

---

## 7. Pre-launch gate

Tick every line before the first real user:

- [ ] Blockers 1–7 in §2 are done.
- [ ] CI is green on the release commit: unit + Cucumber with the coverage
      gate, Playwright (split topology), iOS and Android builds.
- [ ] `npm audit --omit=dev` shows no critical or high advisory.
- [ ] Every setting in §4.1 is set in production, and none of the "never set"
      ones are.
- [ ] The smoke tests in §6.4 pass against production.
- [ ] The device checklist (§6.5) passes on real phones, with production
      settings.
- [ ] An email from production reaches a Gmail and an Outlook inbox (not
      spam): a sign-up code, and a "recovery started" notice.
- [ ] One real payment, and its refund, in Razorpay live mode.
- [ ] The store listings, privacy labels and data-safety form are approved.

---

## 8. Operations

- **Logs to watch:**
  - `[push] not delivered` (an alert channel failing)
  - email driver failures in the outbox (`status: failed`)
  - spikes of 429s (attack, or a wrong `TRUSTED_PROXY_HOPS` making everyone
    share one limit)
- **Rotating a secret:**
  - **Provider and push keys** (Apple `.p8`, FCM service account, Facebook
    secret, Razorpay keys, email key): add the new one, deploy, then revoke
    the old.
  - **`AUTH_SERVER_SECRET`** is never rotated: rotating it reveals which
    emails had accounts.
- **A lost phone:** the Owner removes it from Settings → Your phones on
  another device. That ends its sign-ins and its PIN at once.
- **A suspected break-in on an account:** the Owner changes the password,
  which signs out everything else. A Recovery Kit recovery in progress is
  stopped from the banner or the emailed link.
- **Facebook Graph version:** Meta retires each version about two years after
  release. Move `FACEBOOK_GRAPH_VERSION` before the date Meta announces.
- **Tuning the per-network limits:** `LIMITS` in `lib/auth/rateLimit.ts`.

### 8.1 Mock data

`npm run db:mock` builds six Owners through the real sign-up flow and the
real crypto, so their notes really decrypt, and saves them to a data file:

| Owner | Stage | What it shows |
| :--- | :--- | :--- |
| the inbox itself | healthy | Six notes, two Beneficiaries, one accepted Trusted Friend and one invited, a Recovery Kit |
| `+owner.gentle` | gentle reminder | |
| `+owner.urgent` | urgent reminder | |
| `+owner.critical` | final warning | |
| `+owner.released` | released | Release notices to its Beneficiary |
| `+owner.vacation` | on vacation | Nothing is sent |

Every Beneficiary and Trusted Friend is a plus-address of the same inbox
(`you+meera@gmail.com`), so all of it lands in one place. Every account has
the same password, printed at the end with the Recovery Kit code and the
invitation links.

```bash
npm run db:mock -- --inbox you@gmail.com           # writes data/mock-db.json
DATA_FILE=data/mock-db.json npm run dev            # sign in as any of them
```

Options: `--out <file>`, `--password <p>`, `--force` (replace the file).

`--send` also sends what each Owner's stage calls for (reminders, release
notices, invitations), once each, through the configured driver. To see them
arrive with Resend's sandbox, which sends only to the Resend account's own
address:

```bash
EMAIL_DRIVER=resend RESEND_API_KEY=<from the environment> \
EMAIL_FROM="Virasat <onboarding@resend.dev>" EMAIL_REDIRECT_TO=you@gmail.com \
npm run db:mock -- --inbox you@gmail.com --force --send
```

Development only. `data/` is ignored by git: anyone with the file and the
printed password can open every seeded vault.

---

## 9. Where the tests are

| Command | What it runs |
| :--- | :--- |
| `npm run test:coverage` | Unit tests and Cucumber, under coverage, with the gate for code from phase 2 on (`.c8-new-code.json`) |
| `tests/unit/route-auth.test.ts` (in the above) | Every API route's rule: who may call it, 401/403 without the right session, no Owner reaching another's data. A new route fails it until it is given a rule |
| `npm run build:e2e-split && npm run test:e2e:split` | Playwright against the static app and a separate API, as shipped |
| `npm run test:e2e` | Playwright with app and API on one origin (development) |
| `npm run db:mock` | Not a test: the mock data in §8.1, for trying the whole thing by hand |
| CI: `.github/workflows/ci.yml` | All of the above, on every pull request |
| CI: `.github/workflows/native.yml` | The iOS Simulator build and the Android debug APK, when native code changes |

---

## 10. Change log

Newest first. One line per change that alters what ships or how it is
deployed.

| Date | Commit | Change |
| :--- | :--- | :--- |
| 2026-10-30 | `985bc3e` | SCRUM-36: every API route has a tested rule. `GET /api/email` and `GET /api/billing` no longer list other accounts' mail and payments outside the test harness. |
| 2026-10-25 | `4dbd6a1` | Data file persistence and mock data. New settings: `DATA_FILE`, `EMAIL_REDIRECT_TO` (development and staging only); new: `npm run db:mock`. |
| 2026-10-24 | `4a03a72` | Playwright for the Settings phones list and change password. |
| 2026-10-24 | `0ad23d2` | Phase 5: per-network limits, Argon2id, change password, your phones, recovery banner, push alerts (APNs/FCM). New settings: `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS`, `PUSH_DRIVER`, `APNS_*`, `FCM_SERVICE_ACCOUNT_JSON`. |
| 2026-10-24 | `44bf4ce` | Phase 4: real Apple / Google / Facebook sign-in. New settings: `AUTH_PROVIDERS_DRIVER=native`, `APPLE_CLIENT_IDS`, `GOOGLE_CLIENT_IDS`, `FACEBOOK_*`, `NEXT_PUBLIC_GOOGLE_*`, `NEXT_PUBLIC_FACEBOOK_*`; iOS build settings. |
| 2026-10-24 | `234bc76` | Unit tests and the coverage gate in CI. |
| 2026-10-24 | `de30c6d` | Phase 3: iOS and Android apps with hardware-backed keys. New: `npm run build:native`; `native.yml` CI. |
| 2026-10-24 | `63eb0c3` | Phase 2: static app build and a separate API host. New: `NEXT_PUBLIC_API_BASE`, `npm run build:app` / `build:api`. |
| earlier | `main` | Phase 1 authentication, email delivery, Razorpay billing (`docs/developmentPlan.md` §1). |
