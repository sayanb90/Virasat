"use client";

import React, { useState, useEffect } from "react";
import { BeneficiaryRecord } from "@/lib/state/mockDatabase";
import { Users, Plus, ShieldCheck, Mail, Phone } from "lucide-react";
import { generateBeneficiaryKeyPair } from "@/lib/crypto/asymmetric";

export default function BeneficiariesPage() {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("Spouse");
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBeneficiaries = async () => {
    try {
      const res = await fetch("/api/beneficiaries");
      const data = await res.json();
      if (data.success) {
        setBeneficiaries(data.beneficiaries);
      }
    } catch (err) {
      console.error("Fetch beneficiaries error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBeneficiaries();
  }, []);

  const handleAddBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    try {
      // Generate RSA-OAEP public/private keypair for beneficiary
      const { publicKeyPem, privateKeyPem } = await generateBeneficiaryKeyPair();

      const res = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          relationship,
          publicKeyPem,
          privateKeyPem,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setName("");
        setEmail("");
        setPhone("");
        setIsAdding(false);
        fetchBeneficiaries();
      }
    } catch (err) {
      console.error("Add beneficiary error:", err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>Loved Ones & Heirs</span>
          </h2>
          <p className="text-xs text-slate-500">
            Trusted individuals designated to receive your estate if inactive for 12 months.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Loved One</span>
        </button>
      </div>

      {/* Add Beneficiary Form */}
      {isAdding && (
        <form
          onSubmit={handleAddBeneficiary}
          className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 animate-in fade-in duration-150"
        >
          <h3 className="text-sm font-extrabold text-slate-900">Designate New Heir</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Eleanor Vance"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Relationship</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
              >
                <option value="Spouse">Spouse / Partner</option>
                <option value="Child">Son / Daughter</option>
                <option value="Sibling">Brother / Sister</option>
                <option value="Attorney">Estate Attorney</option>
                <option value="Friend">Trusted Friend</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="e.g. eleanor@family.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phone (SMS Alerts)</label>
              <input
                type="tel"
                placeholder="+1 (555) 019-2834"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="w-1/2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              Save Heir
            </button>
          </div>
        </form>
      )}

      {/* Beneficiaries List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : beneficiaries.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-3xl p-6">
            <p className="font-bold text-slate-800 text-sm">No loved ones added yet</p>
            <p className="mt-1">Add your designated family members who should receive access if needed.</p>
          </div>
        ) : (
          beneficiaries.map((ben) => (
            <div
              key={ben.id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 font-black text-sm">
                    {ben.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">{ben.name}</h3>
                    <span className="inline-block text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {ben.relationship}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Public Key Ready</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                <div className="flex items-center space-x-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{ben.email}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-slate-400">Status: {ben.status}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
