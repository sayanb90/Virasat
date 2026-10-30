/**
 * Virasat - A mock database, built the way real accounts are.
 *
 * Every account is made through the real sign-up flow and the real crypto
 * (lib/auth/flows.ts, lib/crypto): the password is stretched with Argon2id,
 * the vault key is wrapped, and every note is AES-GCM ciphertext under that
 * key. So signing in to a seeded account with its password opens notes that
 * really decrypt; nothing here is a shortcut the app would not take.
 *
 * Owners are placed at each stage of the check-in ladder, so the emails a
 * stage sends can be seen. Their Trusted Friends and Beneficiaries use
 * plus-addresses of one inbox (you+meera@…), so with EMAIL_REDIRECT_TO or a
 * Gmail inbox every email in the flow lands in the same place.
 *
 * Development and demos only. `npm run db:mock` writes the result to a data
 * file (lib/persistence/snapshot.ts) that a server loads with DATA_FILE.
 */

import { authStore } from "../auth/store";
import * as flows from "../auth/flows";
import { buildNewAccount, buildRecoveryKit } from "../crypto/account";
import { importVaultKey } from "../crypto/keys";
import { packAndEncryptSecretPayload } from "../crypto/payloadCodec";
import { generateBeneficiaryKeyPair } from "../crypto/asymmetric";
import { vaultFor } from "../state/mockDatabase";
import { cycleBoundaries, getPhaseFromElapsedDays } from "../state/heartbeatMachine";

const DAY = 86_400_000;

export type LadderStage = "healthy" | "gentle" | "urgent" | "critical" | "released" | "on-vacation";

interface NoteSeed {
  title: string;
  subcategoryId: string;
  body: string;
  /** Index into the owner's beneficiaries; absent for "everyone". */
  for?: number;
}

interface OwnerSeed {
  name: string;
  /** The tag in a plus-address; absent for the main inbox itself. */
  tag?: string;
  stage: LadderStage;
  cycleDays: number;
  notes: NoteSeed[];
  beneficiaries: Array<{ name: string; tag: string; relationship: string }>;
  friends: Array<{ name: string; tag: string; accepted: boolean }>;
}

/**
 * The people. Fictional, with details that read like the real thing but
 * point at nothing: no real account numbers, policies or addresses.
 */
const OWNERS: OwnerSeed[] = [
  {
    name: "Sayan",
    stage: "healthy",
    cycleDays: 365,
    beneficiaries: [
      { name: "Meera", tag: "meera", relationship: "Spouse" },
      { name: "Arjun", tag: "arjun", relationship: "Son" },
    ],
    friends: [
      { name: "Priya", tag: "priya", accepted: true },
      { name: "Rahul", tag: "rahul", accepted: false },
    ],
    notes: [
      {
        title: "Savings account and nominee",
        subcategoryId: "banks.nominees",
        body: "Savings account at the branch near the market (demo: XXXX-1234). Nominee is Meera. The signed nomination form is in the blue file in the almirah.",
        for: 0,
      },
      {
        title: "Life insurance",
        subcategoryId: "insurance.life",
        body: "Term policy (demo number LIC-000000). Claim with the policy document and the death certificate. Agent: Mr. Iyer, number in my phone under 'LIC'.",
        for: 0,
      },
      {
        title: "Health insurance",
        subcategoryId: "insurance.health",
        body: "Family floater, renews every March. The card is in the wallet; the policy PDF is in my email under 'health policy'.",
      },
      {
        title: "Where the will is",
        subcategoryId: "family.will",
        body: "Registered will, copy with our lawyer (Desai & Co., demo). The original is in the bank locker; the key is in the steel box.",
      },
      {
        title: "Mutual funds",
        subcategoryId: "assets.shares",
        body: "SIPs through the broker app (demo account). Statements come to my email every month. Arjun is the nominee on all folios.",
        for: 1,
      },
      {
        title: "Email and phone",
        subcategoryId: "digital.email",
        body: "My main email recovery phone is my own number. The phone PIN is with Meera. Please keep the number active for a year.",
      },
    ],
  },
  {
    name: "Kamala",
    tag: "owner.gentle",
    stage: "gentle",
    cycleDays: 365,
    beneficiaries: [{ name: "Ravi", tag: "ravi", relationship: "Son" }],
    friends: [{ name: "Lakshmi", tag: "lakshmi", accepted: true }],
    notes: [{ title: "Pension", subcategoryId: "banks.retirement", body: "Pension account (demo). Life certificate due every November." }],
  },
  {
    name: "Gopal",
    tag: "owner.urgent",
    stage: "urgent",
    cycleDays: 365,
    beneficiaries: [{ name: "Anita", tag: "anita", relationship: "Daughter" }],
    friends: [{ name: "Suresh", tag: "suresh", accepted: true }],
    notes: [{ title: "House papers", subcategoryId: "assets.realestate", body: "Sale deed and tax receipts in the cupboard (demo)." }],
  },
  {
    name: "Farida",
    tag: "owner.critical",
    stage: "critical",
    cycleDays: 180,
    beneficiaries: [{ name: "Zoya", tag: "zoya", relationship: "Niece" }],
    friends: [{ name: "Imran", tag: "imran", accepted: true }],
    notes: [{ title: "Fixed deposits", subcategoryId: "assets.savings", body: "Three FDs (demo). Receipts in the brown envelope." }],
  },
  {
    name: "Joseph",
    tag: "owner.released",
    stage: "released",
    cycleDays: 90,
    beneficiaries: [{ name: "Mary", tag: "mary", relationship: "Wife" }],
    friends: [],
    notes: [
      { title: "Car", subcategoryId: "assets.vehicles", body: "RC book and insurance in the glovebox (demo)." },
      { title: "Locker", subcategoryId: "assets.valuables", body: "Bank locker (demo). The second key is with Mary." },
    ],
  },
  {
    name: "Anjali",
    tag: "owner.vacation",
    stage: "on-vacation",
    cycleDays: 365,
    beneficiaries: [{ name: "Kiran", tag: "kiran", relationship: "Brother" }],
    friends: [],
    notes: [{ title: "Travel documents", subcategoryId: "family.ids", body: "Passport copies in the cloud folder (demo)." }],
  },
];

/** Days since the last check-in that put an owner at this stage. */
export function elapsedDaysFor(stage: LadderStage, cycleDays: number): number {
  const b = cycleBoundaries(cycleDays);
  switch (stage) {
    case "healthy":
      return 12;
    case "gentle":
    case "on-vacation":
      return b.silentEnd + 2;
    case "urgent":
      return b.gentleEnd + 2;
    case "critical":
      return b.urgentEnd + 2;
    case "released":
      return cycleDays + 1;
  }
}

/** you+tag@domain. */
export function plusAddress(inbox: string, tag?: string): string {
  if (!tag) return inbox.toLowerCase();
  const [local, domain] = inbox.toLowerCase().split("@");
  return `${local.split("+")[0]}+${tag}@${domain}`;
}

const WORDS = ["Mango", "River", "Lamp", "Tiger", "Cloud", "Pepper", "Monsoon", "Lotus", "Kite", "Banyan", "Coral", "Saffron"];

/** Three words and a number: easy to type, comfortably over the 10-character minimum. */
export function demoPassword(random: () => number = Math.random): string {
  const pick = () => WORDS[Math.floor(random() * WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${10 + Math.floor(random() * 90)}`;
}

export interface SeededAccount {
  userId: string;
  name: string;
  email: string;
  stage: LadderStage;
  phase: number;
  cycleDays: number;
  elapsedDays: number;
  notes: number;
  beneficiaries: string[];
  trustedFriends: Array<{ email: string; accepted: boolean; inviteToken: string }>;
  /** Only for the main account: the printed Recovery Kit code. */
  recoveryCode?: string;
}

export interface MockDbResult {
  password: string;
  accounts: SeededAccount[];
}

/** The flows answer with an outcome; a seed that fails stops the run. */
function must<T>(outcome: flows.Outcome<T>, what: string): T {
  if (!outcome.ok) throw new Error(`Could not ${what}: ${outcome.error}`);
  return outcome.data;
}

async function signUp(email: string, name: string, password: string) {
  must(await flows.startSignup(email), `start sign-up for ${email}`);
  // A missing code fails verification below, which names the address.
  const code = authStore.lastCodesForTesting.get(email) ?? "";
  const { signupTicket } = must(flows.verifySignupCode({ email, code }), `verify ${email}`);
  const account = await buildNewAccount(password);
  const kit = await buildRecoveryKit(account.vaultKeyBytes);
  const done = must(
    await flows.completeSignup({ signupTicket, name, ...account.send, recovery: kit.send }),
    `finish sign-up for ${email}`
  );
  const userId = authStore.usersByEmail.get(email)!;
  // Sign-up leaves a session behind; a seeded account starts signed out.
  flows.logout(flows.sessionForToken(done.accessToken)!);
  return { userId, vaultKeyBytes: account.vaultKeyBytes, recoveryCode: kit.code };
}

/**
 * Adds the mock accounts to the stores in memory. The caller saves them
 * (scripts/mock-db.ts). Emails sent during sign-up go through whatever
 * driver is configured; the CLI keeps them on the console.
 */
export async function generateMockDb(options: {
  /** The inbox everything lands in. */
  inbox: string;
  password?: string;
  now?: Date;
}): Promise<MockDbResult> {
  const now = options.now ?? new Date();
  const password = options.password ?? demoPassword();
  const accounts: SeededAccount[] = [];

  const capture = authStore.captureCodesForTesting;
  authStore.captureCodesForTesting = true;
  try {
    for (const seed of OWNERS) {
      const email = plusAddress(options.inbox, seed.tag);
      if (authStore.usersByEmail.has(email)) throw new Error(`${email} already has an account in this database.`);
      const { userId, vaultKeyBytes, recoveryCode } = await signUp(email, seed.name, password);
      const vault = vaultFor(userId);
      const vaultKey = await importVaultKey(vaultKeyBytes);

      const beneficiaries = [];
      for (const [i, b] of seed.beneficiaries.entries()) {
        const keys = await generateBeneficiaryKeyPair();
        beneficiaries.push(
          vault.addBeneficiary({
            id: `ben-${userId}-${i}`,
            name: b.name,
            relationship: b.relationship,
            email: plusAddress(options.inbox, b.tag),
            publicKeyPem: keys.publicKeyPem,
            status: "Active",
            createdAt: now.toISOString(),
          })
        );
      }

      const friends = seed.friends.map((f, i) => {
        const inviteToken = `invite-${userId}-${i}-${Math.random().toString(36).slice(2, 10)}`;
        vault.addTrustedFriend({
          id: `friend-${userId}-${i}`,
          name: f.name,
          email: plusAddress(options.inbox, f.tag),
          status: "Invited",
          inviteToken,
          createdAt: now.toISOString(),
        });
        if (f.accepted) vault.acceptTrustedFriend(inviteToken);
        return { email: plusAddress(options.inbox, f.tag), accepted: f.accepted, inviteToken };
      });

      for (const [i, n] of seed.notes.entries()) {
        const sealed = await packAndEncryptSecretPayload(n.body, null, "text/plain", "", vaultKey);
        const at = new Date(now.getTime() - (seed.notes.length - i) * DAY).toISOString();
        vault.addVaultItem({
          id: `note-${now.getTime() - i}-${userId.slice(-4)}${i}`,
          title: n.title,
          subcategoryId: n.subcategoryId,
          mimeType: "text/plain",
          ciphertextHex: sealed.ciphertextHex,
          ivHex: sealed.ivHex,
          encryptedChestKeyHex: "E_ben_demo_seeded",
          createdAt: at,
          updatedAt: at,
          assignedBeneficiaryIds: n.for === undefined ? [] : [beneficiaries[n.for].id],
        });
      }

      const elapsedDays = elapsedDaysFor(seed.stage, seed.cycleDays);
      vault.updateSettings({ checkInCycleDays: seed.cycleDays });
      vault.simulatedElapsedDays = elapsedDays;
      vault.lastCheckInDate = new Date(now.getTime() - elapsedDays * DAY).toISOString();
      if (seed.stage === "on-vacation") vault.startVacation(new Date(now.getTime() + 21 * DAY), now);

      accounts.push({
        userId,
        name: seed.name,
        email,
        stage: seed.stage,
        phase: getPhaseFromElapsedDays(elapsedDays, seed.cycleDays).phase,
        cycleDays: seed.cycleDays,
        elapsedDays,
        notes: seed.notes.length,
        beneficiaries: beneficiaries.map((b) => b.email),
        trustedFriends: friends,
        ...(seed.tag ? {} : { recoveryCode }),
      });
    }
  } finally {
    authStore.captureCodesForTesting = capture;
    authStore.lastCodesForTesting.clear();
  }
  return { password, accounts };
}
