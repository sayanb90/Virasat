/**
 * Virasat - In-Memory Zero-Knowledge Database Engine
 * Simulates Supabase PostgreSQL + S3 Blob Storage.
 * Security Contract: Stores ONLY base64/hex ciphertext blobs, salt, IVs, and encrypted beneficiary envelopes.
 * Server has ZERO ACCESS to plaintext data, passphrases, or master keys.
 */

export interface VaultItemRecord {
  id: string;
  title: string;
  /**
   * Stable taxonomy subcategory id (e.g. "insurance.life"). Locale packs
   * change the label shown for this id, never the id itself, so a note
   * survives the user switching country.
   */
  subcategoryId: string;
  mimeType: string;
  ciphertextHex: string;
  ivHex: string;
  encryptedChestKeyHex: string; // K_chest encrypted with K_master
  createdAt: string;
  updatedAt: string;
  assignedBeneficiaryIds: string[];
}

export interface BeneficiaryRecord {
  id: string;
  name: string;
  relationship: string;
  email: string;
  publicKeyPem: string;
  privateKeyPem?: string; // Stored in demo mode so reviewer can simulate beneficiary claim easily
  status: "Active" | "Pending Key Verification" | "Access Granted";
  createdAt: string;
}

export interface BeneficiaryEnvelopeRecord {
  id: string;
  vaultItemId: string;
  beneficiaryId: string;
  encryptedChestKeyHex: string; // E_ben(K_chest)
  createdAt: string;
}

export interface TrustedFriendRecord {
  id: string;
  name: string;
  email: string;
  /** Green in the UI only once the person has accepted. */
  status: "Invited" | "Accepted";
  /** Opaque token carried by the invite link. */
  inviteToken: string;
  createdAt: string;
  acceptedAt?: string;
}

/**
 * Account settings that the escalation engine itself depends on, so they live
 * server-side rather than in the browser. Display-only preferences (country,
 * onboarding) stay on the device.
 */
export interface AccountSettings {
  /** Full silence-to-release cycle, in days. */
  checkInCycleDays: number;
  /** ISO date; while in the future the escalation clock does not advance. */
  vacationUntil: string | null;
  /** When the current hold began, so the paused time can be credited back. */
  vacationStartedAt: string | null;
  trustedFriendsEnabled: boolean;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  category: "Crypto" | "ZeroKnowledgeSync" | "Heartbeat" | "Escalation" | "BeneficiaryClaim";
  details: string;
  timestamp: string;
  ipAddress: string;
}

class MockZeroKnowledgeDatabase {
  private vaultItems: Map<string, VaultItemRecord> = new Map();
  private beneficiaries: Map<string, BeneficiaryRecord> = new Map();
  private envelopes: Map<string, BeneficiaryEnvelopeRecord> = new Map();
  private auditLogs: AuditLogRecord[] = [];
  private trustedFriends: Map<string, TrustedFriendRecord> = new Map();
  private settings: AccountSettings = {
    checkInCycleDays: 365,
    vacationUntil: null,
    vacationStartedAt: null,
    trustedFriendsEnabled: true,
  };
  public simulatedElapsedDays: number = 0;
  public lastCheckInDate: string = new Date().toISOString();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // Seed sample beneficiary
    const benId = "ben-1";
    this.beneficiaries.set(benId, {
      id: benId,
      name: "Eleanor Vance (Primary Heir)",
      relationship: "Spouse & Estate Executor",
      email: "eleanor.vance@example.com",
      publicKeyPem: `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuX2Z23H0h... (Demo RSA Key)\n-----END PUBLIC KEY-----`,
      status: "Active",
      createdAt: new Date().toISOString(),
    });

    this.logAudit(
      "Database Initialized",
      "ZeroKnowledgeSync",
      "Initialized Zero-Knowledge Storage Engine & Cryptographic State"
    );
  }

  public logAudit(action: string, category: AuditLogRecord["category"], details: string) {
    this.auditLogs.unshift({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      category,
      details,
      timestamp: new Date().toLocaleTimeString() + " " + new Date().toLocaleDateString(),
      ipAddress: "127.0.0.1 (Client-Encrypted)",
    });
  }

  // Vault Items (Ciphertext Blobs Only)
  public getVaultItems(): VaultItemRecord[] {
    return Array.from(this.vaultItems.values());
  }

  public addVaultItem(item: VaultItemRecord): VaultItemRecord {
    this.vaultItems.set(item.id, item);
    this.logAudit(
      "Ciphertext Blob Uploaded",
      "ZeroKnowledgeSync",
      `Stored note '${item.title}' (${item.subcategoryId}) as AES-256-GCM ciphertext.`
    );
    return item;
  }

  public updateVaultItem(
    id: string,
    patch: Partial<Omit<VaultItemRecord, "id" | "createdAt">>
  ): VaultItemRecord | null {
    const existing = this.vaultItems.get(id);
    if (!existing) return null;

    const updated: VaultItemRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.vaultItems.set(id, updated);
    this.logAudit(
      "Ciphertext Blob Replaced",
      "ZeroKnowledgeSync",
      `Re-encrypted note '${updated.title}' and replaced the stored ciphertext.`
    );
    return updated;
  }

  public getVaultItem(id: string): VaultItemRecord | undefined {
    return this.vaultItems.get(id);
  }

  public deleteVaultItem(id: string): boolean {
    const item = this.vaultItems.get(id);
    if (item) {
      this.vaultItems.delete(id);
      this.logAudit("Vault Item Deleted", "ZeroKnowledgeSync", `Purged ciphertext record '${item.title}'`);
      return true;
    }
    return false;
  }

  // Beneficiaries
  public getBeneficiaries(): BeneficiaryRecord[] {
    return Array.from(this.beneficiaries.values());
  }

  public addBeneficiary(ben: BeneficiaryRecord): BeneficiaryRecord {
    this.beneficiaries.set(ben.id, ben);
    this.logAudit(
      "Beneficiary Added",
      "Crypto",
      `Registered beneficiary ${ben.name} with RSA Public Key for envelope encryption.`
    );
    return ben;
  }

  public deleteBeneficiary(id: string): boolean {
    const ben = this.beneficiaries.get(id);
    if (ben) {
      this.beneficiaries.delete(id);
      this.logAudit("Beneficiary Removed", "Crypto", `Removed beneficiary ${ben.name}`);
      return true;
    }
    return false;
  }

  // Envelopes: E_ben(K_chest)
  public getEnvelopes(): BeneficiaryEnvelopeRecord[] {
    return Array.from(this.envelopes.values());
  }

  public setEnvelope(envelope: BeneficiaryEnvelopeRecord) {
    this.envelopes.set(envelope.id, envelope);
    this.logAudit(
      "Chest Key Envelope Bound",
      "Crypto",
      `Bound encrypted chest key envelope E_ben(K_chest) to beneficiary ${envelope.beneficiaryId}`
    );
  }

  // Account settings
  public getSettings(): AccountSettings {
    return { ...this.settings };
  }

  public updateSettings(patch: Partial<AccountSettings>): AccountSettings {
    this.settings = { ...this.settings, ...patch };
    this.logAudit(
      "Settings Updated",
      "Heartbeat",
      `Changed ${Object.keys(patch).join(", ")}.`
    );
    return this.getSettings();
  }

  /** True while a vacation hold is active, which freezes the escalation clock. */
  public isOnVacation(now: Date = new Date()): boolean {
    if (!this.settings.vacationUntil) return false;
    return new Date(this.settings.vacationUntil).getTime() > now.getTime();
  }

  /** Begins a hold. The caller is responsible for enforcing the cap. */
  public startVacation(until: Date, now: Date = new Date()): AccountSettings {
    this.settings = {
      ...this.settings,
      vacationUntil: until.toISOString(),
      vacationStartedAt: now.toISOString(),
    };
    this.logAudit(
      "Vacation Mode Started",
      "Heartbeat",
      `Safety timer paused until ${until.toISOString().slice(0, 10)}.`
    );
    return this.getSettings();
  }

  /**
   * Ends a hold and gives the paused time back.
   *
   * Without this, a month away would leave the user a month closer to release
   * than when they left — the pause would quietly cost them the very time it
   * was meant to protect. Called both when the user returns early and lazily
   * when an expired hold is next observed, since there is no scheduler here.
   */
  public settleVacation(now: Date = new Date()): AccountSettings {
    const { vacationStartedAt, vacationUntil } = this.settings;
    if (!vacationStartedAt && !vacationUntil) return this.getSettings();

    let pausedDays = 0;
    if (vacationStartedAt) {
      const started = new Date(vacationStartedAt).getTime();
      // Credit only up to the hold's own end date, so an expired hold noticed
      // months later does not hand back time that was never protected.
      const plannedEnd = vacationUntil ? new Date(vacationUntil).getTime() : now.getTime();
      const endedAt = Math.min(now.getTime(), plannedEnd);
      pausedDays = Math.max(0, Math.floor((endedAt - started) / 86_400_000));
    }

    if (pausedDays > 0) {
      this.simulatedElapsedDays = Math.max(0, this.simulatedElapsedDays - pausedDays);
      this.lastCheckInDate = new Date(
        new Date(this.lastCheckInDate).getTime() + pausedDays * 86_400_000
      ).toISOString();
    }

    this.settings = { ...this.settings, vacationUntil: null, vacationStartedAt: null };
    this.logAudit(
      "Vacation Mode Ended",
      "Heartbeat",
      `Safety timer resumed. ${pausedDays} paused day(s) credited back.`
    );
    return this.getSettings();
  }

  /** Lazily closes out a hold whose end date has already passed. */
  public settleVacationIfExpired(now: Date = new Date()): void {
    if (this.settings.vacationUntil && !this.isOnVacation(now)) {
      this.settleVacation(now);
    }
  }

  // Trusted Friends
  public getTrustedFriends(): TrustedFriendRecord[] {
    return Array.from(this.trustedFriends.values());
  }

  public addTrustedFriend(friend: TrustedFriendRecord): TrustedFriendRecord {
    this.trustedFriends.set(friend.id, friend);
    this.logAudit(
      "Trusted Friend Invited",
      "Heartbeat",
      `Invited ${friend.email} to vouch for this account.`
    );
    return friend;
  }

  public acceptTrustedFriend(inviteToken: string): TrustedFriendRecord | null {
    const friend = this.getTrustedFriends().find((f) => f.inviteToken === inviteToken);
    if (!friend) return null;
    if (friend.status === "Accepted") return friend;

    const accepted: TrustedFriendRecord = {
      ...friend,
      status: "Accepted",
      acceptedAt: new Date().toISOString(),
    };
    this.trustedFriends.set(accepted.id, accepted);
    this.logAudit(
      "Trusted Friend Accepted",
      "Heartbeat",
      `${accepted.email} accepted and can now confirm your wellbeing.`
    );
    return accepted;
  }

  public deleteTrustedFriend(id: string): boolean {
    const friend = this.trustedFriends.get(id);
    if (!friend) return false;
    this.trustedFriends.delete(id);
    this.logAudit("Trusted Friend Removed", "Heartbeat", `Removed ${friend.email}.`);
    return true;
  }

  /**
   * Returns the store to its freshly-seeded state.
   *
   * Exposed only for end-to-end tests, which share one server process and
   * would otherwise leak data between specs. The route that calls this is
   * gated behind an environment variable and does not exist in a normal run.
   */
  public resetForTesting(): void {
    this.vaultItems.clear();
    this.beneficiaries.clear();
    this.envelopes.clear();
    this.trustedFriends.clear();
    this.auditLogs = [];
    this.settings = {
      checkInCycleDays: 365,
      vacationUntil: null,
      vacationStartedAt: null,
      trustedFriendsEnabled: true,
    };
    this.simulatedElapsedDays = 0;
    this.lastCheckInDate = new Date().toISOString();
    this.seedInitialData();
  }

  // Audit Logs
  public getAuditLogs(): AuditLogRecord[] {
    return this.auditLogs;
  }
}

// Global Singleton Instance for dev/demo server state
export const db = new MockZeroKnowledgeDatabase();
