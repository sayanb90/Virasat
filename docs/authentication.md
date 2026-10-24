# Signing in: identity, device unlock, and the vault key

**Status:** phase 1 built (server sign-in, device unlock on the browser harness,
recovery); phases 2–5 are not. See §9.
**Author:** drafted with Claude Code, 24 October 2026.

---

## Why this document exists

Today there is no authentication. The sign-in screen checks that an email
looks like an email and sets a localStorage flag; every API route is open; the
unlock screen ships with the passphrase pre-filled and a Face ID button that
submits it. That was right for a preview and is wrong for anything else.

What was asked for:

- Authentication runs on **our own server** — no hosted identity provider.
- **New users** sign up with email + password, or with Apple / Google /
  Facebook. A social sign-up takes **only name and email** from the provider,
  then asks for a password all the same, then sets up Face ID / Touch ID / PIN.
- **Returning users** sign in with email + password or a social account, and
  are then **always** asked for Face ID / Touch ID / PIN.
- Two tiers, every time. Social sign-on is a convenience for tier one, never a
  substitute for tier two.

Decisions already taken in review:

| Question | Decision |
| :--- | :--- |
| Is the account password the vault passphrase? | **Yes — one password.** It both proves who you are and opens the vault, without the server ever learning it. |
| Where do biometrics run? | **A native app wrapper** (Capacitor), using the iOS Keychain and Android Keystore. |
| What is the PIN? | **A Virasat PIN, rate-limited by the server**, so a stolen phone cannot have it guessed offline. |
| Is a web version shipped? | **No — Android and iOS only.** A browser build survives purely as a dev and test harness (§7). |
| New-phone second tier | **Password + a code to the account email** (3.4). |
| Forgotten password | **There must be a recovery path** — the audience is senior citizens (3.6). |
| Beneficiary / Witness access | **No Virasat account.** They prove they own the email address with a code (§7). |
| How the family receives the notes | **By email only:** a password-protected PDF, and the handover code in a separate email. The code needs a piece from a Witness *and* a Beneficiary, so our server can rebuild it only at release (§7). |
| Recovery hold | **72 hours** (3.6). |

---

## 1. The constraint that shapes everything

Virasat's promise is that the server cannot read your notes. The vault key is
derived from your password **on the device** (`lib/crypto/argon2.ts`) and never
leaves it.

That splits "signing in" into two different jobs:

| Job | Question it answers | Who checks it |
| :--- | :--- | :--- |
| **Identity** | Is this the account holder? | The server |
| **Unlock** | Can this device decrypt the vault? | Only the device |

A Google sign-in answers the first and cannot answer the second — Google knows
nothing about the vault key. So a returning user who signs in with Google and
then Face ID needs **a copy of the vault key already on that phone**, locked
behind Face ID. That copy is what Face ID / Touch ID / PIN actually unlock.

It follows directly:

> **On a device that has never seen your password, social sign-in is not
> enough.** The first sign-in on a new phone needs the password once. After
> that, social + Face ID works on that phone.

This is not a policy choice; there is nothing else the phone could decrypt the
vault with. The UI has to say so plainly ("This is a new phone — enter your
Virasat password once to set it up").

---

## 2. Keys

```
password ──PBKDF2/Argon2id(salt)──▶ K_root
                                     ├─HKDF("auth")──▶ K_auth   → sent to server as a login proof
                                     └─HKDF("wrap")──▶ K_wrap   → never leaves the device

K_vault  (random, 256-bit, made once at sign-up)
  wrapped by K_wrap               → stored on the server   (opens the vault anywhere, with the password)
  wrapped by biometric key        → stored on the device   (Face ID / Touch ID)
  wrapped by PIN-split key        → stored on the device   (PIN, see §4)

K_chest (per note) wrapped by K_vault   ← replaces today's "wrapped by K_master"
```

Three changes from today, each for a reason:

1. **The server receives `K_auth`, not the password.** It stores a slow hash
   of `K_auth` (scrypt from `node:crypto` — no new dependency) and compares.
   `K_auth` and `K_wrap` come out of HKDF with different labels, so knowing
   one says nothing about the other. This is the Bitwarden / 1Password shape.
2. **A random `K_vault` sits between the password and the notes.** Changing
   the password then re-wraps one key instead of re-encrypting every note, and
   each device can hold its own wrapped copy.
3. **The salt is per user**, fetched before login (`POST /api/auth/prelogin`).
   An unknown email gets a salt derived deterministically from the email and a
   server secret, so the endpoint does not reveal who has an account.

Also raise the KDF cost: PBKDF2-SHA-256 at 100,000 rounds is below the current
OWASP floor of 600,000. Argon2id via WebAssembly is better still, and the file
is already named for it.

The store is in-memory and demo-only today, so there is no migration. Every
existing payload is throwaway.

---

## 3. The flows

### 3.1 New user — email and password

1. Enter email → server sends a **6-digit code** to verify the address. Without
   this, anyone could register someone else's email, and the safety ladder
   would start writing to a stranger.
2. Enter name, choose password (strength meter).
3. Device derives `K_root`, makes `K_vault`, sends `K_auth` + wrapped
   `K_vault` + salt to the server. Account created.
4. **Set up unlock:** Face ID / Touch ID if the device has it, and a PIN in
   every case (biometrics fail; a PIN is the fallback that works with wet hands
   and a cracked sensor).
5. **Save the Recovery Kit** (3.6). The step cannot be skipped silently, though
   it can be postponed: a postponed kit becomes a gentle reminder on the home
   screen until it is done.
6. Into the app.

### 3.2 New user — Apple, Google or Facebook

1. Native provider sheet → the app receives an **ID token** (Apple, Google) or
   an access token (Facebook) and sends it to our server.
2. Server verifies it (§6) and takes **only name and email**. Nothing else is
   requested or stored: no photo, friends or profile.
3. If the provider vouches for the email (Apple always; Google when
   `email_verified`), skip the code. Otherwise (Facebook, or no email at all),
   ask for the email and verify it with a code as in 3.1.
4. Choose a password — the same screen as 3.1, step 2.
5. Set up Face ID / Touch ID / PIN, and save the Recovery Kit — the same as
   3.1, steps 4–5.

The social account is now a linked **identity** on the user. The password is
what the vault actually depends on.

### 3.3 Returning user, on a phone already set up

1. Tier one: Apple / Google / Facebook, **or** email + password.
2. Server answers with a **pending session** — good for five minutes and for
   exactly one thing: completing tier two.
3. Tier two: Face ID / Touch ID, falling back to PIN.
   - The biometric unlocks the device's copy of `K_vault` **and** a device
     signing key. The app signs a server challenge with that key.
   - The server checks the signature against the device's registered public
     key, and only then upgrades the pending session to a full one.
4. Into the app.

Tier two is checked **by the server**, not just on the phone. A modified app
that skips the Face ID prompt still cannot get a full session, because it
cannot produce the signature.

### 3.4 Returning user, on a new phone

1. Tier one, as above.
2. There is no device key yet, so tier two cannot be biometric. Instead:
   **password** (which the vault needs anyway) **plus a code to the account
   email**. This keeps "two tiers" true on the one occasion biometrics do not
   exist yet, and it is the moment an attacker with a phished password would
   strike.
3. Enrol this phone: Face ID / Touch ID and PIN, as in 3.1.
4. The account email gets a "New phone signed in to Virasat" notice with a way
   to remove the device.

If tier one was email + password, step 2 asks only for the code.

### 3.5 Linking a social account to an existing user

A social sign-in whose verified email matches an existing account does **not**
link automatically. It asks for the Virasat password first. Auto-linking on
email alone means whoever controls a provider account (or a recycled email
address) takes over the Virasat account.

### 3.6 Forgotten password — recovery

The usual "email me a reset link" cannot work here: the server cannot rebuild
`K_vault` from an email, because it never had it. Recovery therefore has to
come from something **the user holds**. There are two such things, tried in
this order.

**Path A — the phone still works (the common case).**
Most people who forget a password still have the phone they set up. That phone
already holds `K_vault` behind Face ID / PIN, so:

1. "Forgot password?" → Face ID / Touch ID / PIN.
2. Code to the account email.
3. Choose a new password. The phone re-wraps the same `K_vault` under the new
   `K_wrap` and sends the new `K_auth`. No note is touched.

This needs no paper, no waiting and no helper, and the server stays blind. It
should be the first thing the forgot-password screen offers.

**Path B — the phone is lost too: the Recovery Kit.**
At sign-up the device makes a random **recovery code** and stores
`K_vault` wrapped by it on the server. The code itself exists only on paper:

- A printable **Recovery Kit** page: the code in large type, grouped as
  `7KQ4-M2XD-9PRT-…`, with the account email and plain instructions —
  "Keep this with your will or important papers. Anyone who has this page
  *and* your email can open your vault."
- Optionally, a copy handed to **one family member** the user names (very
  often a Beneficiary already). For this audience a person is a more reliable
  store than a drawer.

Recovering with it:

1. "I lost my phone and forgot my password" → enter the account email, and the
   code from that email.
2. Enter the recovery code (typed, or scanned from the QR on the kit).
3. **A 72-hour hold.** During it every enrolled device and the account email
   get "Someone is recovering your Virasat account — tap here if this isn't
   you." One tap cancels. This is the same *owner veto* the release design
   uses, and for the same reason: a family member who has the paper and access
   to the email must not be able to open a living person's vault quietly.
4. After the hold: choose a new password, enrol this phone, and **a new
   Recovery Kit is issued** — the old code is spent.

| Attacker has | Can they recover? |
| :--- | :--- |
| The paper only | No — needs the account email too. |
| The email only | No — needs the paper. |
| Paper + email | Only if the Owner does not cancel within 72 hours. |
| A server breach | No — has the wrapped blob, not the code. |

**Path C — no phone, no kit.** The vault cannot be opened, by anyone,
including us. Sign-up says this once, plainly, at the Recovery Kit step. The
kit is what prevents it.

**Later, not now:** splitting the recovery code between two or three people
(Shamir, 2-of-3) so no single holder is enough. Stronger, but harder to
explain to this audience, and it overlaps with Witnesses, who confirm a death.
One role should not both confirm a death and be able to open the vault.

---

## 4. Tier two in detail

### Face ID / Touch ID

| | iOS | Android |
| :--- | :--- | :--- |
| Where `K_vault` copy lives | Keychain, `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` | Keystore-wrapped, in app storage |
| Gate | `SecAccessControl` with `.biometryCurrentSet` | `setUserAuthenticationRequired(true)` + `BiometricPrompt` with a `CryptoObject` |
| Device signing key | Secure Enclave P-256 key, same access control | Keystore EC key, same gate, StrongBox where available |
| New fingerprint / face enrolled | Item invalidated by the OS | Key invalidated by the OS |

The "current set" flags matter: if someone adds their own face to a borrowed
phone, the stored key dies and the next sign-in falls back to PIN or password.
That is the correct behaviour, and the UI should explain it rather than look
broken.

`ThisDeviceOnly` keeps the key out of iCloud backups. A restored phone counts
as a new phone (3.4).

### PIN

A 6-digit PIN has a million values; a key locked by the PIN alone falls to an
offline search in seconds. So the PIN never locks anything by itself:

```
K_pin = HKDF( device_secret ‖ server_share )
```

- `device_secret` — random, stored on the device (Keychain/Keystore, no
  biometric gate).
- `server_share` — random, stored on the server, **released only after the
  server verifies the PIN**. The server stores a slow hash of the PIN, peppered
  per device.
- **Five wrong PINs → the server deletes `server_share`.** The device's PIN
  copy of `K_vault` is then permanently undecryptable, and the user needs the
  password (3.4).

| Attacker has | Can they unlock? |
| :--- | :--- |
| The phone only | No — needs `server_share`; five guesses then it is gone. |
| A server breach only | No — has the PIN hash and `server_share`, but not `device_secret`. |
| Both | Yes, offline. This is the residual risk, and it is why the PIN is a convenience on top of the password, not instead of it. |

The PIN path gives the server the same signed challenge as biometrics, so a
full session always ends in proof of the device key.

### When tier two is asked again

Once unlocked, the vault key is held in memory. The *re-prompt* rule decides
when the app forgets it and asks for Face ID / PIN again:

- **Cold start** — the app was fully closed or the phone restarted: always ask.
- **Back from the background** — the user switched to WhatsApp and came back:
  ask only if they were away longer than **5 minutes**.
- **"Lock now"** in the menu, for handing the phone to someone.

When the app goes to the background it also hides its contents from the
app-switcher snapshot, so the preview never shows a note. The 5 minutes is
the open question in §10. Shorter becomes "the app keeps asking me things".
Longer becomes an unlocked vault on a shared tablet.

---

## 5. Sessions and the server

### Tokens, not cookies

The native app's pages are served from `capacitor://localhost` (iOS) and
`https://localhost` (Android), while the API is on our domain. Third-party
cookies in WKWebView are blocked by ITP and unreliable everywhere else. So:

- **Access token:** opaque, random 32 bytes, 15 minutes, sent as
  `Authorization: Bearer`.
- **Refresh token:** opaque, 30 days, stored in the Keychain/Keystore,
  **rotated on every use**. If a refresh token is reused, the whole family is
  revoked (that is how theft is detected).
- **Both stored server-side as hashes**, so revoking a device or signing out
  everywhere is a delete, not a wait for expiry. No JWTs for our own sessions.
- Every session is bound to a device id. A full session requires the device
  signature from §3.3.

### Guarding the API

All 13 routes under `app/api/` become authenticated, except a small public
allow-list: `prelogin`, `login`, `signup`, `verify-code`, social callbacks,
billing webhooks (which have their own signature), and the beneficiary /
trusted-friend acceptance routes (those people are not users; they keep their
own token-in-link checks).

One helper, `requireSession(req)`, used at the top of each route handler. A
single choke point beats per-route checks, and it is what a test can pin:
"every route not on the allow-list returns 401 without a token."

### Records

```ts
User        { id, name, email, emailVerifiedAt, kdf: { salt, params },
              authHash, wrappedVaultKey, recoveryWrappedVaultKey, createdAt }
Identity    { userId, provider: "apple" | "google" | "facebook", subject, email, linkedAt }
Device      { id, userId, name, platform, signingPublicKey, pinHash, pinPepper,
              serverShare, pinFailures, lastSeenAt, revokedAt? }
Session     { id, userId, deviceId, stage: "pending" | "full",
              accessHash, refreshHash, family, expiresAt }
EmailCode   { email, purpose, codeHash, attempts, expiresAt }
Recovery    { userId, startedAt, releasableAt, cancelledAt?, completedAt? }
```

`Identity` is keyed on the provider's **`sub`**, never on email. Emails
change; Apple's relay addresses can be revoked; `sub` is permanent.

### Rate limits and enumeration

- Login, code entry and PIN entry are limited per account **and** per IP.
- Every login failure gets the same message and takes the same time, whether
  the email exists or not.
- `prelogin` always returns a salt (§2).

---

## 6. Social providers

The pattern is: **native SDK on the phone, verification on our server.** The
app never trusts what the SDK says; it forwards a token, and the server checks
it.

| | Apple | Google | Facebook |
| :--- | :--- | :--- | :--- |
| Native flow | `ASAuthorizationAppleIDProvider` | Credential Manager (Android), Google Sign-In (iOS) | Facebook Login SDK |
| Token sent to us | ID token (JWT) | ID token (JWT) | Access token |
| Server verifies | Signature against Apple's JWKS; `iss`, `aud` = our bundle id, `exp`, `nonce` | Signature against Google's JWKS; `iss`, `aud` = our client ids, `exp`, `nonce` | `GET /debug_token` with our app token; check `app_id`, then `GET /me?fields=name,email` |
| Email | Always present and verified; may be a `privaterelay.appleid.com` address | `email_verified` must be true | **May be absent** (phone-number accounts) → ask and verify with a code |
| Name | **Only on the first authorization, ever** — capture it then or lose it | In the token | From `/me` |

A **nonce** generated by our server and echoed in the token stops a token
captured from one sign-in being replayed into another.

JWT verification uses **`jose`**, the one new server dependency. Hand-rolled
JWKS fetching, key rotation and algorithm pinning is exactly the code that
goes wrong quietly.

**App Store rule 4.8:** an iOS app that offers Google or Facebook sign-in must
also offer Sign in with Apple. It is already in scope; it also means Apple
cannot be dropped later on its own.

### Running without credentials

Same shape as email and billing: `AUTH_PROVIDERS_DRIVER=stub` (the default)
shows a "Continue as Test User (Google)" button that mints a fake verified
identity locally. A developer can run the whole flow, and the specs can
exercise it, with no provider accounts. A half-configured deployment cannot
accidentally accept stub identities: the stub refuses to load when
`NODE_ENV=production`, unless the end-to-end harness (`VIRASAT_E2E=1`) is
running, since Playwright tests the production build.

---

## 7. The native wrapper

Capacitor wraps the existing UI; it does not replace it. But it does change how
the app is built, and that is most of the cost of this decision.

### What changes in the Next.js app

The app ships inside the native bundle as a **static export**
(`output: "export"`). The pages are already client components, so most of this
is mechanical. Next 16's static export does not support:

| Feature | Where it is used today | Change |
| :--- | :--- | :--- |
| Dynamic segments without `generateStaticParams` | `notes/[subcategoryId]`, `notes/[subcategoryId]/[noteId]`, `notes/[subcategoryId]/new`, `trusted-friends/accept/[token]` | Subcategories are a fixed taxonomy → `generateStaticParams`. Note ids and invite tokens are not → move to query strings (`/notes/view?id=`). |
| Server `redirect()` | `app/page.tsx` | Client-side `router.replace`. |
| Route handlers that read the request | All of `app/api/` | They move to a **separately deployed server** (the same Next.js app built normally, serving only `/api`). |
| `proxy.ts` | Not used yet | Do not introduce it; `requireSession` lives in the handlers. |

So there are two builds from one repo: the **app** (static, bundled into iOS and
Android) and the **API** (Node server on our domain, with CORS allowing
exactly the two Capacitor origins).

Shipping the UI inside the bundle — rather than pointing the wrapper at a
hosted URL — is deliberate: Apple rejects apps that are only a remote web page
(guideline 4.2), and a bundled UI cannot be swapped by whoever controls the
server.

### Native plugins needed

- Sign in with Apple, Google Sign-In, Facebook Login.
- Keychain/Keystore storage with biometric access control **and** a
  hardware-backed signing key (§4).

For the biometric plugin, a thin plugin of our own (Swift + Kotlin, a few
hundred lines) is likely safer than a community one: the security of tier two
is exactly which access-control flags are set, and those should be ours to
read and pin. The three sign-in SDKs can use maintained community plugins,
chosen in phase 3.

### Testing

Native flows run in the iOS Simulator (Face ID is simulated under
*Features → Face ID*) and the Android emulator (fingerprint via *Extended
controls*). Simulation Lab frames a web page, so it cannot exercise the
Keychain, the Secure Enclave or native sign-in sheets.

**The browser build stays, as a harness and not a product.** No web version is
shipped. But `next dev` in a browser is still the fastest loop for UI work,
and it is what Playwright and Simulation Lab run against. In the browser, the
native bridge is replaced by a **dev-only fake**: "Face ID" is a confirm
button, and the device key is a WebCrypto key in memory. The fake does not
exist in the static export, so it cannot reach a shipped app. The same rule
applies to the stub provider driver (§6).

### Beneficiaries and Witnesses without an account

Agreed in review: neither needs a Virasat account, and nobody needs the app or
a website to receive what was left to them. **Everything arrives by email.**

#### What a Beneficiary receives

Two emails at release:

1. **A password-protected PDF** of exactly the notes assigned to them, with
   attachments (scans, photos) inside it. It opens in any PDF reader, on any
   phone or computer.
2. **The handover code** that opens it, in a separate email.

Keeping them apart means a PDF that is forwarded, or picked up by a mail
scanner, travels without its code. Protecting the Beneficiary's inbox itself
is outside the scope of the product.

Each Beneficiary gets only their own PDF. A large set of scans is split across
several emails, staying under the ~20 MB attachment limit most providers
enforce.

#### Where the PDF comes from

The server cannot read notes, so it cannot build the PDF. The **Owner's phone**
builds it:

- Whenever a note assigned to a Beneficiary is added or changed, the phone
  rebuilds that Beneficiary's PDF, encrypts it with the handover code
  (AES-256, the standard PDF encryption), and uploads it.
- The server stores the encrypted PDF and cannot open it. At release it emails
  the PDF as-is.
- The PDF is rebuilt in the background, so a slightly stale copy is the worst
  case if the Owner's last edit never finished uploading. The Owner's screen
  shows "Family copy up to date ✓" so this is visible.

#### The handover code: three halves, three roles

**One handover code per Owner**, covering every Beneficiary's PDF. It is
separate from the Owner's Recovery Kit code (3.6) and must stay separate.
Otherwise a Beneficiary holding it could begin recovering a living Owner's
account.

The code is never stored whole. The Owner's phone makes it from three random
pieces, **one per role**:

```
handover_code = KDF( server_half ‖ witness_half ‖ beneficiary_half )
```

| Piece | Held by | Handed over when |
| :--- | :--- | :--- |
| `server_half` | Virasat | When the release rule is satisfied |
| `witness_half` | **Every Witness**, at most two (the same piece, so either one is enough) | A Witness **confirms the death** |
| `beneficiary_half` | **Every Beneficiary**, any number (the same piece, so any one is enough) | A Beneficiary **confirms the death** |

So each role does exactly one thing, and the code needs all three:

- **Witnesses validate the death** from outside the family's interest. They
  never receive notes, and their piece is useless without a Beneficiary's.
- **Beneficiaries co-confirm and receive.** Their piece is useless without a
  Witness's.
- **Virasat enforces the rule**: confirmations, the cooling-off window and the
  Owner's veto. Its piece is useless without both of the others.

The phone keeps its own copy of the code, wrapped by `K_vault`, so it can
rebuild PDFs. The server stores that wrapped copy and cannot open it.

**Distribution is by email from the Owner's own mailbox, never from Virasat.**
When the Owner adds a Witness or Beneficiary, the phone opens the Owner's own
mail app (Gmail, Apple Mail, …) with an email already written for that role:

> *Subject: Please keep this email — from Ramesh*
>
> *I have named you as a witness in Virasat, which looks after my important
> papers for the family. Please keep this email. If anything happens to me,
> you will be asked to confirm it by tapping the button below.*
>
> **[ Confirm with Virasat ]**

The Beneficiary version says *"…you will receive my papers. If anything
happens to me, tap the button below to let Virasat know."*

The Owner taps Send. The piece travels inside the link, after the `#`.
Browsers never send that part to a server, and link-scanning bots in mail
providers do not see it either. Virasat's servers never handle a piece until
the moment it is used, and that is the whole guarantee: if Virasat sent these
emails, it would have every piece and could rebuild the code whenever it
liked.

#### At release

The release rule (`release-and-entitlement.md` §5) is: **one Witness
confirmation + one Beneficiary confirmation + the Owner's 14-day cooling-off
window.** Two Witnesses are not enough, and neither is any number of
Beneficiaries. The two pieces enforce exactly this.

1. **A Witness confirms.** They tap the button in the Owner's email and verify
   their address with a 6-digit code. This hands `witness_half` to Virasat.
2. **A Beneficiary confirms.** The same, from the Beneficiary's email. This
   hands over `beneficiary_half`. The order does not matter. Either side
   arriving first triggers an email to the other side: "Anil has told us Ramesh
   has passed away. If this is true, please open the email Ramesh sent you and
   tap *Confirm*."
3. **14 days of cooling-off, with the Owner's veto**, as in §5. Throughout
   it, the Owner gets dated warnings on every channel: *"Anil and Meera have
   told us you have passed away. Your notes go to your family on 14 March.
   Tap here if you are reading this."* One tap cancels: the release stops,
   the attempt is logged, and both pieces are deleted. The tap needs no Face
   ID, because a mistaken cancel only delays a release and never exposes
   anything. If nobody taps, delivery follows on day 14.
4. **Delivery.** When the window ends, the server combines the three pieces
   and sends every Beneficiary two emails: their PDF, then the handover code.
   It then **deletes all three pieces and the rebuilt code**.

| Situation | Can the notes be read? |
| :--- | :--- |
| A breach of Virasat before release | No. Virasat has only `server_half`. |
| A Virasat employee before release | No, for the same reason. |
| Both Witnesses together | No. They have no `beneficiary_half`. |
| Any number of Beneficiaries together | No. They have no `witness_half`. |
| A Witness and a Beneficiary colluding | Only by getting through the release rule, which includes the living Owner's veto. Even then, the server has to combine the pieces, so they cannot do it offline. |
| After release | Yes, by the Beneficiaries, as intended. |

#### What can go wrong

- **Every Witness, or every Beneficiary, loses the Owner's email.** Then the
  code cannot be rebuilt, and the PDFs cannot be opened by anyone, including
  us. Two defences:
  - **"Check it still works."** Once a year, alongside the usual check-in,
    Virasat asks each holder to tap their link. The page hashes the piece
    **on their device** and sends only the hash, and the server compares it
    with a hash stored at setup. The holder proves they still have the piece
    without ever revealing it. The Owner's Settings screen shows ✓ or "Not
    checked since 2027" next to each person.
  - **"Send again"** from Settings, which reopens the Owner's mail app with
    the same email.
- **A holder is removed** (a falling-out, a divorce). They still hold their
  piece. Removing anyone **rotates the code**: new pieces, PDFs rebuilt, and a
  fresh email to everyone who remains. The removed person's email becomes
  useless.
- **Only one Witness.** Allowed, but a single point of failure: if they die
  first, nothing can release until the Owner names another. Settings
  recommends a second, and two is the maximum.
- **The Owner has no mail app set up.** The phone falls back to the share sheet
  (any app the Owner chooses), or to a printed page per person.

#### The confirm and receive page

Tapping the button needs one tiny page served by the API host, the same for
Witnesses and Beneficiaries. It shows "Confirm that Ramesh has passed away",
a code field and a button. There is no sign-in, nothing to browse, and notes are never
displayed there. The notes arrive by email.

Unrelated to identity, this design also fixes the known defect recorded in the
README, where the server stores Beneficiary private keys. Beneficiaries no
longer need a key pair at all: the PDF and the handover code replace them.

---

## 8. Prerequisites before any integration

- **Apple Developer Program** membership (needed for Sign in with Apple, the
  Secure Enclave on a device, and TestFlight).
- **Google Cloud** OAuth client ids: one each for iOS, Android and the server.
- **Meta developer app**, with app review for the `email` permission.
- **A domain with HTTPS** for the API. Apple will not accept `localhost`
  redirect or service ids.
- **Persistence.** Accounts, devices and sessions in an in-memory store that
  resets on restart log everyone out on every deploy. This feature is the
  forcing function for the database noted under *Not yet built* in the README.
- App Store privacy labels and the Play data-safety form: we collect name and
  email; nothing else.

---

## 9. Proposed phasing

| Phase | Delivers | Testable with |
| :--- | :--- | :--- |
| **1. Server auth core** | `User`/`Device`/`Session` records, prelogin/signup/login, email codes, `requireSession` on every route, the stub provider driver, the dev-only device fake. Key hierarchy (§2) in `lib/crypto`. Recovery Kit and both recovery paths (3.6). The pre-filled passphrase and fake Face ID button go. | Cucumber + Playwright on the browser harness, no credentials |
| **2. Static export + API split** | Query-string routes, CORS, the app build and the API build, plus the witness confirmation page. | Static build against a local API |
| **3. Capacitor shell** | iOS + Android projects, the biometric/keychain plugin, PIN with server share, app-switcher privacy screen. | Simulators |
| **3b. Handover by email** | PDF builder on the phone, the three code pieces, the mail-composer step, confirm/receive page, release emails, the yearly "check it still works", rotation on removal. Replaces the Beneficiary key pairs. | Simulators + the console email driver |
| **4. Social providers** | Apple, Google, Facebook drivers and native sheets. | Real provider test apps |
| **5. Hardening** | Rate limits, device list and remote sign-out in Settings, new-device emails, refresh-token reuse detection. | Specs per rule |

Phase 1 is useful by itself: it closes the "every API route is open" gap,
even before there is a native app.

**Phase 1 is built** (October 2026): `lib/auth`, `lib/crypto/keys.ts`,
`lib/device`, the screens under `/welcome`, `features/10_authentication.feature`
and `e2e/auth.spec.ts`. Two deviations from the table: the Beneficiary claim
page no longer reads the vault (it explains email delivery, which is phase 3b),
and per-IP rate limits are left to phase 5.

---

## 10. Open questions

### Still open

None. The design is ready for review as a whole.

### Settled in review, 24 October 2026

- New-phone second tier: password + email code is enough. No approval from
  another phone.
- Forgotten password: a recovery path is required. It is 3.6, with phone-first
  recovery and then a Recovery Kit.
- Web: Android and iOS only. The browser build is a dev harness.
- Beneficiaries and Witnesses: no account. They verify the email with a code.
- Re-prompt: cold start, 5 minutes in the background, and "Lock now".
- Recovery hold: 72 hours.
- Release rule: one Witness + one Beneficiary + a 14-day cooling-off window
  with the Owner's veto. (Not to be confused with the 72-hour recovery hold
  in 3.6.) One or
  two Witnesses, any number of Beneficiaries. The death-certificate route is
  dropped.
- Handover: option B, by email only. The PDF and the handover code go in
  separate emails. The code is rebuilt only at release, from a Witness piece
  (confirming the death) and a Beneficiary piece (accepting delivery), both
  sent by email from the Owner's own mailbox. One code covers all notes.
  Protecting a Beneficiary's inbox is out of scope.
