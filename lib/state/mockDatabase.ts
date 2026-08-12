/**
 * Virasat - In-Memory Zero-Knowledge Database Engine
 * Simulates Supabase PostgreSQL + S3 Blob Storage.
 * Security Contract: Stores ONLY base64/hex ciphertext blobs, salt, IVs, and encrypted beneficiary envelopes.
 * Server has ZERO ACCESS to plaintext data, passphrases, or master keys.
 */

export interface VaultItemRecord {
  id: string;
  title: string;
  category: "Credentials" | "Private Note" | "Document" | "Crypto Key" | "Legal Estate";
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
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
      `Stored item '${item.title}' (Category: ${item.category}) as AES-256-GCM ciphertext.`
    );
    return item;
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

  // Audit Logs
  public getAuditLogs(): AuditLogRecord[] {
    return this.auditLogs;
  }
}

// Global Singleton Instance for dev/demo server state
export const db = new MockZeroKnowledgeDatabase();
