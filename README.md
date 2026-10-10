# Virasat (virasat) - Zero-Knowledge Digital Estate Vault & Dead Man's Switch

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.org/)
[![WebCrypto API](https://img.shields.io/badge/Security-WebCrypto_AES--256--GCM-emerald?style=for-the-badge&logo=shield)](https://developer.mozilla.org/en-US/docs/Web/API/WebCrypto_API)

**Virasat** is a cross-platform (iOS, Android, Web) digital estate vault and automated dead man's switch designed for senior citizens and families. It operates on a **Zero-Knowledge Architecture**—client-side encryption guarantees that server operators and platform owners NEVER have access to master keys, passphrases, or plaintext secrets.

---

## 🌟 Core Philosophy

* **Peace of Mind & Zero Intrusion:** Designed for a "set-it-and-forget-it" user experience. The app operates in complete silence for 9 months out of the year, avoiding unnecessary logins or intrusive notifications.
* **Zero-Knowledge Architecture:** Client-side WebCrypto encryption is mandatory. The server acts strictly as a zero-knowledge blob storage and an automated heartbeat queue engine.
* **Senior-Friendly Accessibility:** Built with high-contrast elements, clear typography (18pt–24pt+), large 60px+ touch targets, and plain-English labels.
* **Reliable 1-Year Escalation Engine:** Automated state machine managing a 365-day escalation cycle from silent operation to final estate release for designated heirs.

---

## 🔐 Cryptographic Architecture

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT-SIDE DEVICE                                |
|                                                                                   |
|  Passphrase + Salt ---> [ PBKDF2 (SHA-256, 100k rounds) ] ---> K_master           |
|                                                                                   |
|  Secret Payload & File ---> [ AES-256-GCM + 12-byte IV ]  ---> Ciphertext Blob    |
|                                                                                   |
|  Per-item Chest Key K_chest ---> [ RSA-OAEP 2048 Public Key ] ---> E_ben(K_chest) |
+-----------------------------------------------------------------------------------+
                                         |
                                         | Strictly Ciphertext Blobs
                                         v
+-----------------------------------------------------------------------------------+
|                        ZERO-KNOWLEDGE SERVER & DATABASE                           |
|                                                                                   |
|  • Stores ONLY Base64/Hex Ciphertext, IVs, Salt, and Encrypted Envelopes.        |
|  • ZERO access to passphrases, master keys, or unencrypted secrets.               |
+-----------------------------------------------------------------------------------+
```

### Key Derivation ($K_{master}$)
- **PBKDF2 / SHA-256 (100,000 Iterations)**: Derives a 256-bit Master Key ($K_{master}$) client-side using WebCrypto API.
- **Precomputed Hex Lookup Engine**: Memory-safe lookup table hex encoder/decoder for handling large binary file ciphertexts (PDFs, Images) without V8 string allocation limits.

### Symmetric Encryption (AES-256-GCM)
- Every secret note, password, and file attachment (PDF/Image) is encrypted client-side using **AES-256-GCM** with a unique 12-byte (96-bit) cryptographically random IV.

### Asymmetric Beneficiary Envelopes ($E_{ben}(K_{chest})$)
- Each vault item generates a unique 256-bit Chest Key ($K_{chest}$).
- When assigned to a loved one, $K_{chest}$ is envelope-encrypted using the beneficiary's RSA-OAEP 2048-bit Public Key ($E_{ben}(K_{chest})$). Heirs decrypt their digital inheritance using their private key ($SK_{ben}$) upon release.

---

## ⏱️ 1-Year Heartbeat & Escalation Cycle

| Phase | Days | Duration | Description |
| :--- | :--- | :--- | :--- |
| **P0: Silent Period** | Days 0 – 270 | Months 0 – 9 | App operates in 100% complete silence. Zero intrusive alerts or required logins. |
| **P1: Gentle Reminders** | Days 270 – 330 | Months 9 – 11 | 5 gentle check-in emails spaced 12–14 days apart asking the user to confirm well-being. |
| **P2: Urgent Escalation** | Days 330 – 345 | Months 11 – 11.5 | 5 urgent SMS & email alerts spaced 3–4 days apart. |
| **P3: Critical Countdown** | Days 345 – 365 | Months 11.5 – 12 | 10 daily emergency alerts via Email, SMS & WhatsApp to confirm safety. |
| **P4: Vault Released** | Days 365+ | Month 12+ | Automated release of Chest Keys ($K_{chest}$) to designated beneficiaries & heirs. |

---

## ✨ Features

- **🗂️ Two-level category tree:** Eight category groups and ~48 subcategories, each with a plain-English line explaining exactly what belongs there — so a user is never left guessing.
- **🌍 Locale packs (India-first, international-ready):** One universal structure, swappable vocabulary. India sees EPF/PPF/NPS, demat and folio numbers, Aadhaar and PAN, khata and encumbrance certificates, plus two subcategories with no international counterpart: **Nominee Details** and **Bank Locker**. Country is chosen in Settings and never rewrites stored notes.
- **📝 Encrypted notes:** Create, read, edit, attach to and delete notes. Everything but the title is AES-256-GCM ciphertext before it leaves the device.
- **🔑 In-memory session:** The master key is derived on unlock and held only in the tab's memory — never in storage, never on the server. Closing the tab ends the session.
- **👥 Loved Ones & Heirs:** Beneficiaries and their RSA public-key bindings.
- **💚 Safety check-in:** One-tap "I am safe and well", with a fast-forward simulator for the escalation ladder.
- **🛡️ Security log:** An append-only record of cryptographic operations, folded under Settings.

---

## 🗂️ Category Taxonomy & Locale Packs

The tree is deliberately split in two:

| Layer | What it holds | File |
| :--- | :--- | :--- |
| **Structure** | Group and subcategory **ids** (`insurance.life`, `banks.retirement`). Identical in every market. | `lib/taxonomy/tree.ts` |
| **Vocabulary** | Labels, guidance text, extra subcategories and ordering, per country. | `lib/taxonomy/locales/*.ts` |

Notes persist the **id**, never the label. A user can switch country and every
note keeps a meaningful category — including notes filed under a subcategory
that only exists in another market, which `describeSubcategory()` resolves by
searching every pack before falling back.

**Adding a market is a content task, not a refactor:** add a `LocalePack` under
`lib/taxonomy/locales/`, register it in `LOCALE_PACKS`, and the whole app picks
it up. Each pack may override labels and guidance, hide subcategories, append
market-specific ones, and promote the ones its users care about most.

`SubcategoryDef.essential` is already carried through the resolver but unused —
it exists so a shorter "Essentials" view can later be a filter rather than a
re-modelling exercise.

---

## 🧪 Tests

Two suites, deliberately split by what they are good at.

```bash
npm test          # Cucumber — logic, crypto, taxonomy, escalation arithmetic
npm run test:e2e  # Playwright — real browser, real flows
npm run test:all  # both
```

**Cucumber (34 scenarios)** covers things with no UI: AES-GCM round trips and
key derivation, the note payload codec with attachments, taxonomy resolution
and locale packs, escalation phase maths, backup format, and the vacation cap
and credit-back arithmetic.

**Playwright (39 scenarios)** drives a real browser at 390×844 against the
production build — not the dev server — so the specs exercise what ships:

| Spec | Covers |
| :--- | :--- |
| `onboarding` | the welcome gate, and that an invited Trusted Friend or claiming Beneficiary is never trapped by it |
| `notes` | unlock, India vocabulary, write → save → decrypt, edit-in-place without duplicating, delete, recipient chooser |
| `trusted-friends` | invite → accept in a second browser context → turns green, duplicate refusal, disable |
| `backup` | export, **no plaintext in the file**, delete everything, restore, confirm it still decrypts |
| `safety-and-settings` | plain-language safety screen, interval reaching the engine, the 6-month cap enforced server-side, pause and resume |
| `handover` | release follows the owner's cycle rather than a hardcoded year |
| `navigation` | every drawer destination resolves, and **no screen renders dark surfaces inside the light shell** |

### Shared state between specs

The app keeps everything in one in-memory store, so specs would otherwise leak
into one another. Each resets it via `POST /api/test/reset`, which returns 404
unless `VIRASAT_E2E=1` — set only by the Playwright config. Workers are pinned
to 1 so two specs cannot reset each other mid-run.

### One known failure

`handover.spec.ts` carries a `test.fixme` for a Beneficiary reading a released
note. It is a real defect, not a flake: `saveNote()` encrypts the body with the
owner's master key, then mints a chest key that encrypts nothing and seals
*that* to the Beneficiary — who ends up holding a key that opens nothing. The
test is left in place so it passes the moment the envelope scheme is fixed.

---

## 🛠️ Technology Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Library:** React 19, TypeScript
- **Styling:** Tailwind CSS v4 (design tokens in `app/globals.css`)
- **Icons:** Lucide React
- **Cryptography:** WebCrypto API (AES-256-GCM, PBKDF2, RSA-OAEP)
- **Tests:** Cucumber (logic) and Playwright (end-to-end flows)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or later
- npm or yarn

### Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/sayanb90/Virasat.git
   cd Virasat
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **Build for Production:**
   ```bash
   npm run build
   npm run start
   ```

---

## 📜 License

This project is licensed under the MIT License.
