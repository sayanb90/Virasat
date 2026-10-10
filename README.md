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
IVs and sealed envelopes, and holds no passphrase, no master key and no plaintext.

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
|  Passphrase + Salt ---> [ PBKDF2 (SHA-256, 100k rounds) ] ---> K_master           |
|                                                                                   |
|  { notes, file, fileName, mimeType }                                              |
|          |                                                                        |
|          +--> [ pack ] --> [ AES-256-GCM, fresh 12-byte IV, K_master ] --> blob   |
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
|  • No passphrase, no master key, no plaintext body ever reaches it.               |
|  • Note TITLES are currently stored in the clear — see Known gaps.                |
+-----------------------------------------------------------------------------------+
```

**Read the diagram carefully: `K_chest` does not currently encrypt anything.**
The payload is sealed with `K_master`, and `K_chest` is minted, sealed to the
beneficiary and stored beside it. A beneficiary therefore receives a key that
opens nothing.

Two other things the diagram does not promise: note **titles** are stored in the
clear, and the server currently keeps each beneficiary's RSA **private** key as
well as their public one. All three are in [Known gaps](#-known-gaps), they
interact, and they are the work standing between this and a product that is
honestly zero-knowledge.

### Key derivation (`K_master`)
- **PBKDF2 / SHA-256, 100,000 iterations** → a 256-bit master key, derived
  client-side (`lib/crypto/argon2.ts`).
- The key lives in the tab's memory only. It is never written to storage, never
  sent anywhere, and closing the tab ends the session.
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
| Key derivation, master key handling | `lib/crypto/argon2.ts` |
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
by its end. `/claim` and `/api/heartbeat` read the user's actual cycle; nothing
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
- **📥 Claim & inherited views** — `/claim` for a beneficiary after release,
  `/inherited` for what has been left to them. Neither is trapped by onboarding.
- **🛡️ Security log** — an append-only record of cryptographic operations, folded
  under Settings rather than sitting in the main navigation.
- **❓ Help** — plain-language answers, reached from Settings ("Get support")
  and from the beneficiary's `/inherited` screen.

### Routes

| Route | Purpose |
| :--- | :--- |
| `/` | Home — cycle status and the safety check-in |
| `/welcome`, `/welcome/sign-in` | Onboarding gate and unlock |
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
| `/claim`, `/inherited` | Beneficiary-side release and inheritance |
| `/help` | Plain-language help (linked from Settings and `/inherited`) |

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

**Cucumber (47 scenarios)** covers things with no UI: AES-GCM round trips and key
derivation, the note payload codec with attachments (a real 1.4MB buffer),
taxonomy resolution and locale packs, escalation phase maths *at every cycle
length*, the backup format, the vacation cap and credit-back arithmetic, and a
guard that no key, salt or passphrase material is ever written to the console.

**Playwright (50 scenarios)** drives a real browser at 390×844 against the
**production build**, not the dev server, so the specs exercise what ships:

| Spec | Covers |
| :--- | :--- |
| `onboarding` | the welcome gate, and that an invited Trusted Friend or claiming Beneficiary is never trapped by it |
| `notes` | unlock, India vocabulary, write → save → decrypt, edit-in-place without duplicating, delete, recipient chooser |
| `trusted-friends` | invite → accept in a second browser context → turns green, duplicate refusal, disable |
| `backup` | export, **no plaintext in the file**, delete everything, restore, confirm it still decrypts |
| `safety-and-settings` | plain-language safety screen, interval reaching the engine, the 6-month cap enforced server-side, pause and resume |
| `handover` | release follows the owner's cycle rather than a hardcoded year |
| `navigation` | every drawer destination resolves, an unknown address gets the reassuring not-found page, and **no screen renders dark surfaces inside the light shell** |
| `security` | a wrong passphrase cannot read any note body, and locking clears the session |
| `attachments` | a file survives save and reopen, never reaches the server in the clear, and can be removed without losing the note |
| `localisation` | switching country re-labels the tree, hides market-specific sections, and **never makes a note unreachable** |

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
and the `/claim` demo depends on it.

This one is not independent: **fixing defect 1 while this stands makes things
worse, not better.** Once the payload is sealed to `K_chest` and `K_chest` is
sealed to the beneficiary's public key, a server that also holds the matching
private key can decrypt every released note — and the architecture would *look*
sound while being fully readable server-side. The private key has to move to the
beneficiary (shown once, never stored) in the same change, or ahead of it.

Defects 1–3 all change the stored payload format, so they are best done as one
piece of work.

### Not yet built

- **There is no authentication.** Every API route is open: anyone who can reach
  the server can list, write and delete notes. The crypto means they get
  ciphertext, but availability and integrity are unprotected, and titles are
  readable (defect 2).
- **The store is in-memory** (`lib/state/mockDatabase.ts`) and resets on
  restart. Persistence is the obvious next step; the class interface is already
  the seam to put it behind.
- **Escalation messages are simulated, not sent.** No email, SMS or WhatsApp
  provider is wired in.
- **Passphrase recovery does not exist.** By design — but it means a forgotten
  passphrase is unrecoverable, and the UI does not yet say so loudly enough for
  this audience.

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
- `useSearchParams` requires a Suspense boundary. This app avoids it by using
  path segments instead.
- The React Compiler lint rules are on: no `Date.now()` during render
  (`react-hooks/purity`), and no `setState` in an effect
  (`react-hooks/set-state-in-effect`). For localStorage-backed state the app
  uses `useSyncExternalStore` — see `lib/recents.ts`, `lib/onboarding.ts`,
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
