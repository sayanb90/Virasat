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

- **📱 Mobile App Frame Simulator:** Switch between **📱 iOS (iPhone 16 Pro)**, **🤖 Android**, and **💻 Expanded View** modes.
- **👤 Top Profile Dropdown Navigation:** Clean header navigation with user profile badge and quick access to all screens.
- **🔐 Google / Apple / Email Authentication:** OAuth sign-in integration preserving zero-knowledge client encryption.
- **📦 My Family Chest (Vault):** Add, edit, view, copy, download, replace, or delete encrypted confidential secrets and files.
- **👥 Loved Ones & Heirs:** Manage designated beneficiaries and RSA public key bindings.
- **💚 Safety Check-In & Time Machine:** Prominent 1-tap **"I AM SAFE & WELL"** check-in button and fast-forward escalation simulator.
- **🛡️ Zero-Knowledge Security Audit Log:** Immutable client-side log tracking cryptographic operations and state syncs.

---

## 🛠️ Technology Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **Library:** React 19, TypeScript
- **Styling:** Tailwind CSS, Framer Motion
- **Icons:** Lucide React
- **Cryptography:** WebCrypto API (AES-256-GCM, PBKDF2, RSA-OAEP)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or later
- npm or yarn

### Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/sayanb90/Virasat.git
   cd Virasat/code
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
