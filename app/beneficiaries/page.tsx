"use client";

import React, { useState, useEffect } from "react";
import { Users, Plus, Key, ShieldCheck, Mail, Copy, CheckCircle2, Trash2 } from "lucide-react";
import { generateBeneficiaryKeyPair } from "@/lib/crypto/asymmetric";

export default function SeniorBeneficiariesPage() {
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("Spouse & Estate Executor");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const fetchBeneficiaries = async () => {
    try {
      const res = await fetch("/api/beneficiaries");
      const data = await res.json();
      if (data.success) {
        setBeneficiaries(data.beneficiaries);
      }
    } catch (err) {
      console.error("Fetch beneficiaries error:", err);
    }
  };

  useEffect(() => {
    fetchBeneficiaries();
  }, []);

  const handleAddBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    setIsGeneratingKey(true);
    try {
      const keyPair = await generateBeneficiaryKeyPair();

      const res = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          relationship,
          publicKeyPem: keyPair.publicKeyPem,
          privateKeyPem: keyPair.privateKeyPem,
        }),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setName("");
        setEmail("");
        fetchBeneficiaries();
      }
    } catch (err) {
      console.error("Add beneficiary error:", err);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleDeleteBeneficiary = async (id: string) => {
    if (!confirm("Are you sure you want to remove this loved one?")) return;
    try {
      const res = await fetch(`/api/beneficiaries?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchBeneficiaries();
    } catch (err) {
      console.error("Delete beneficiary error:", err);
    }
  };

  const handleCopyPrivateKey = (pem: string, id: string) => {
    navigator.clipboard.writeText(pem);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0E101B] border border-white/10 p-5 rounded-2xl shadow-xl flex flex-col space-y-3">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/30 text-sky-400">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">My Trusted Loved Ones</h1>
            <p className="text-xs text-sky-400 font-medium">
              Family members who will receive your vault if you don&apos;t check in for 12 months.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-purple-600 hover:from-sky-400 hover:to-purple-500 text-black font-black text-xs tracking-wide transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Add Family Member or Heir</span>
        </button>
      </div>

      {/* Add Beneficiary Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#121420] border border-sky-500/30 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white border-b border-white/10 pb-2">
              Add Family Member
            </h3>

            <form onSubmit={handleAddBeneficiary} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eleanor Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="eleanor@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Relationship</label>
                <input
                  type="text"
                  placeholder="Spouse, Daughter, Son, Executor..."
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingKey}
                  className="px-5 py-2 rounded-xl bg-sky-500 text-black font-extrabold text-xs"
                >
                  {isGeneratingKey ? "Adding..." : "Save Loved One"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Beneficiaries Grid */}
      <div className="space-y-3">
        {beneficiaries.map((ben) => (
          <div
            key={ben.id}
            className="p-5 rounded-2xl bg-[#0D0F18] border border-white/10 space-y-3 shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-purple-600 text-black font-black text-lg flex items-center justify-center shadow-md">
                  {ben.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{ben.name}</h3>
                  <p className="text-xs text-sky-400 font-medium">{ben.relationship}</p>
                </div>
              </div>

              <button
                onClick={() => handleDeleteBeneficiary(ben.id)}
                className="p-2 text-gray-500 hover:text-rose-400 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-2 text-xs text-gray-400 font-mono">
              <Mail className="w-3.5 h-3.5 text-gray-500" />
              <span>{ben.email}</span>
            </div>

            {ben.privateKeyPem && (
              <button
                onClick={() => handleCopyPrivateKey(ben.privateKeyPem, ben.id)}
                className="w-full py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-all"
              >
                {copiedKeyId === ben.id ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied Heir Access Key!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Heir Key (For Testing Claim Portal)</span>
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
