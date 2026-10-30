/**
 * npm run db:mock -- [--inbox you@gmail.com] [--out data/mock-db.json]
 *                    [--password Some-Words-42] [--send] [--force]
 *
 * Builds a mock database (lib/dev/mockDb.ts) and saves it as a data file.
 * Then: DATA_FILE=data/mock-db.json npm run dev, and sign in.
 *
 *   --send   also send the emails the seeded state calls for, through the
 *            configured EMAIL_DRIVER (set EMAIL_REDIRECT_TO to land them all
 *            in one inbox). Without it, every email stays on the console.
 *   --force  replace an existing data file.
 */

// The browser crypto helpers reach for window.crypto.
const g = globalThis as { window?: unknown };
if (!g.window) g.window = globalThis;

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { generateMockDb } from "../lib/dev/mockDb";
import { sendMockEmails } from "../lib/dev/mockEmails";
import { saveSnapshotFile } from "../lib/persistence/snapshot";
import { mailerStatus } from "../lib/email";

async function main() {
  const { values } = parseArgs({
    options: {
      inbox: { type: "string", default: process.env.SEED_INBOX ?? "sayanb90@gmail.com" },
      out: { type: "string", default: "data/mock-db.json" },
      password: { type: "string", default: process.env.SEED_PASSWORD },
      send: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  const out = values.out!;
  if (existsSync(out) && !values.force) {
    console.error(`${out} already exists. Use --force to replace it (its accounts will be lost).`);
    process.exit(1);
  }

  // Sign-up codes go to the console while seeding: they are not for anyone.
  const driver = process.env.EMAIL_DRIVER;
  process.env.EMAIL_DRIVER = "console";
  const log = console.log;
  console.log = () => {};
  let result;
  try {
    result = await generateMockDb({ inbox: values.inbox!, password: values.password });
  } finally {
    console.log = log;
    if (driver === undefined) delete process.env.EMAIL_DRIVER;
    else process.env.EMAIL_DRIVER = driver;
  }
  const { resetOutbox } = await import("../lib/email/outbox");
  resetOutbox();

  console.log(`\nMock database: ${result.accounts.length} accounts, all with the password  ${result.password}\n`);
  for (const a of result.accounts) {
    console.log(`  ${a.email.padEnd(40)} ${a.stage.padEnd(12)} phase ${a.phase}, day ${a.elapsedDays} of ${a.cycleDays}, ${a.notes} note(s)`);
  }
  const main = result.accounts[0];
  console.log(`\n  Recovery Kit code for ${main.email}: ${main.recoveryCode}`);
  const invited = result.accounts.flatMap((a) => a.trustedFriends.filter((f) => !f.accepted));
  for (const f of invited) console.log(`  Trusted Friend invitation for ${f.email}: /trusted-friends/accept?token=${f.inviteToken}`);

  if (values.send) {
    const status = mailerStatus();
    console.log(`\nSending through ${status.driver} as ${status.from}${process.env.EMAIL_REDIRECT_TO ? `, redirected to ${process.env.EMAIL_REDIRECT_TO}` : ""}:`);
    if (!status.ready) console.log(`  The driver is not ready: ${status.reason}`);
    const rows = await sendMockEmails(result.accounts);
    for (const r of rows) {
      console.log(`  ${r.status.padEnd(7)} ${r.to.padEnd(40)} ${r.subject}${r.error ? `  (${r.error})` : ""}`);
    }
    if (rows.length === 0) console.log("  Nothing is due.");
  }

  saveSnapshotFile(out);
  console.log(`\nSaved ${out}. Start a server on it:\n\n  DATA_FILE=${out} npm run dev\n`);
  console.log("Then sign in with an address above and the password. This browser is a new phone to the");
  console.log("account, so it asks for a code from the email: with the console driver, the code is in the");
  console.log("server's log.\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
