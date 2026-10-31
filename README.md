# Virasat — a zero-knowledge vault for the things your family will need

**Virasat** is a digital estate vault with an automated check-in cycle, built for senior
citizens and their families. A person writes down what their family would otherwise have to
hunt for (policy numbers, where the locker key is, who the nominee is) and it is encrypted
on their own device before it goes anywhere. If they stop confirming they are well, the vault
is handed to the people they chose. The server stores ciphertext, IVs and sealed envelopes,
and holds no password, no vault key and no plaintext.

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, WebCrypto (AES-256-GCM,
HKDF, Argon2id), Capacitor 8 for the iOS and Android apps.

> This is not the Next.js most training data describes. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing code.

## Documentation

All documentation lives in Notion (Virasat → Runbook, and Plan, research and engineering):
the Developer guide (architecture, crypto, features, routes, tests, known gaps), the
Authentication design, the Release, entitlement and billing plan, the Development plan, and
the Runbook for going live. The repository keeps this README and the agent files
(`AGENTS.md`, `CLAUDE.md`).

- Runbook: https://app.notion.com/p/40a23f85984081edaf57e65462c939f2

## Quick start

Prerequisites: Node.js 20 or later, npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Everything is in memory unless `DATA_FILE` names a file to save it to. For real-looking
accounts, one at each check-in stage:

```bash
npm run db:mock -- --inbox you@gmail.com
DATA_FILE=data/mock-db.json npm run dev     # sign in with the printed password
```

## Tests

```bash
npm run test:unit      # node:test
npm test               # Cucumber
npm run test:coverage  # both, with the coverage gate for new code
npm run test:e2e       # Playwright, app and API on one origin
npm run test:all       # unit, Cucumber, Playwright

npm run build:e2e-split && npm run test:e2e:split   # the shipping topology
```

CI runs all of these on every pull request (`.github/workflows/ci.yml`), and compiles the iOS
and Android apps when native code changes (`.github/workflows/native.yml`).

## Builds

The UI and the API are deployed separately (`next.config.ts`, `BUILD_TARGET`):

```bash
NEXT_PUBLIC_API_BASE=https://api.yourdomain.com npm run build:app      # static export → out/
npm run build:api && npm run start                                     # the API host
NEXT_PUBLIC_API_BASE=https://api.yourdomain.com npm run build:native   # export + cap sync
```

Every routing file outside `app/api/` must stay `.tsx`, or it silently drops out of the app
build.

## License

MIT.
