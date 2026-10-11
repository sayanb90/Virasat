"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Mail, Plus, Trash2, UserPlus } from "lucide-react";
import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import { generateBeneficiaryKeyPair } from "@/lib/crypto/asymmetric";
import type { BeneficiaryRecord } from "@/lib/state/mockDatabase";

export default function BeneficiaryPage() {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/beneficiaries");
        const data = await res.json();
        if (!cancelled && data.success) setBeneficiaries(data.beneficiaries);
      } catch (err) {
        console.error("Could not load beneficiaries:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setWorking(true);
    setError("");
    try {
      // The key pair is made here, on the device. Only the public half is ever
      // needed to seal a note for them.
      const keyPair = await generateBeneficiaryKeyPair();
      const res = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          relationship: relationship.trim() || "Beneficiary",
          publicKeyPem: keyPair.publicKeyPem,
          privateKeyPem: keyPair.privateKeyPem,
        }),
      });
      if (!res.ok) {
        setError("We could not add that person. Please try again.");
        return;
      }
      setName("");
      setEmail("");
      setRelationship("");
      setAdding(false);
      reload();
    } catch (err) {
      console.error("Add beneficiary failed:", err);
      setError("We could not add that person. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  const remove = async (person: BeneficiaryRecord) => {
    if (
      !window.confirm(
        `Remove ${person.name}? They will no longer receive any of your notes.`
      )
    ) {
      return;
    }
    await fetch(`/api/beneficiaries?id=${encodeURIComponent(person.id)}`, { method: "DELETE" });
    reload();
  };

  const copyRecoveryKey = async (person: BeneficiaryRecord) => {
    if (!person.privateKeyPem) return;
    try {
      await navigator.clipboard.writeText(person.privateKeyPem);
      setCopiedId(person.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copy this recovery key and give it to them to keep safe:", person.privateKeyPem);
    }
  };

  return (
    <div className="pb-12">
      <Eyebrow>Beneficiary</Eyebrow>
      <PageTitle>Who receives your notes</PageTitle>

      <p className="mb-6 text-[17px] leading-relaxed text-[var(--text-muted)]">
        These are the people your notes will go to if you stop answering our check-ins. We will
        not tell them they have been chosen — that is yours to share, whenever you are ready.
      </p>

      {loading ? (
        <p className="py-10 text-center text-[17px] text-[var(--text-muted)]">Loading…</p>
      ) : beneficiaries.length === 0 && !adding ? (
        <EmptyState
          title="You have not chosen anyone yet"
          body="Until you name someone, your notes have nowhere to go. You can change your mind at any time."
          action={
            <Button size="lg" onClick={() => setAdding(true)}>
              <UserPlus className="h-5 w-5" aria-hidden="true" />
              Choose a Beneficiary
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {beneficiaries.map((person) => (
            <li
              key={person.id}
              className="rounded-[16px] border border-[var(--border)] bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[var(--action-soft)] text-[20px] font-bold text-[var(--action)]"
                  aria-hidden="true"
                >
                  {person.name.trim().charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[19px] font-bold leading-snug text-[var(--text)]">
                    {person.name}
                  </p>
                  {person.relationship && (
                    <p className="text-[16px] text-[var(--text-muted)]">{person.relationship}</p>
                  )}
                  {/* Wraps rather than truncating: half an email address
                      tells the user nothing about which one it is. */}
                  <p className="mt-1 flex items-start gap-1.5 text-[16px] text-[var(--text-faint)]">
                    <Mail className="mt-[5px] h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-all">{person.email}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => remove(person)}
                  aria-label={`Remove ${person.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {person.privateKeyPem && (
                <Button
                  variant="secondary"
                  onClick={() => copyRecoveryKey(person)}
                  className="mt-3 w-full"
                >
                  {copiedId === person.id ? (
                    <>
                      <Check className="h-5 w-5" aria-hidden="true" />
                      Copied — give it to them to keep safe
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5" aria-hidden="true" />
                      Copy their recovery key
                    </>
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form
          onSubmit={add}
          className="mt-4 space-y-3 rounded-[16px] border border-[var(--border-strong)] bg-white p-4"
        >
          <Field id="ben-name" label="Their name" value={name} onChange={setName} placeholder="For example, Meera Bhattacharjee" required />
          <Field id="ben-rel" label="How you know them" value={relationship} onChange={setRelationship} placeholder="For example, daughter" />
          <Field id="ben-email" label="Their email address" value={email} onChange={setEmail} placeholder="name@example.com" type="email" required />

          {error && (
            <p role="alert" className="text-[16px] text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="quiet" onClick={() => setAdding(false)} disabled={working} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={working} className="flex-1">
              {working ? "Setting up…" : "Add"}
            </Button>
          </div>
        </form>
      )}

      {!adding && beneficiaries.length > 0 && (
        <Button variant="secondary" onClick={() => setAdding(true)} className="mt-4 w-full">
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add another
        </Button>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-semibold text-[var(--action)]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[56px] w-full rounded-[12px] border border-[var(--border-strong)] px-4 text-[18px] outline-none focus:border-[var(--action)]"
      />
    </div>
  );
}
