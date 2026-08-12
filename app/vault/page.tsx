"use client";

import React, { useState, useEffect } from "react";
import { Vault, Plus, Lock, Eye, Trash2, FileText, ShieldCheck } from "lucide-react";
import { PassphraseModal } from "@/components/PassphraseModal";
import { AddVaultItemModal } from "@/components/AddVaultItemModal";
import { SecretEditorModal } from "@/components/SecretEditorModal";
import { VaultItemRecord } from "@/lib/state/mockDatabase";

export default function SeniorVaultPage() {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [masterKeyHex, setMasterKeyHex] = useState<string>("");
  const [items, setItems] = useState<VaultItemRecord[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<VaultItemRecord | null>(null);

  const fetchData = async () => {
    try {
      const [vRes, bRes] = await Promise.all([fetch("/api/vault"), fetch("/api/beneficiaries")]);
      const vData = await vRes.json();
      const bData = await bRes.json();

      if (vData.success) {
        setItems(vData.items);
      }
      if (bData.success) setBeneficiaries(bData.beneficiaries);
    } catch (err) {
      console.error("Vault fetch error:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to remove this item from your chest?")) return;

    try {
      const res = await fetch(`/api/vault?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Session Unlock Modal */}
      {!masterKey && (
        <PassphraseModal
          onMasterKeyDerived={(key, hex) => {
            setMasterKey(key);
            setMasterKeyHex(hex);
          }}
        />
      )}

      {/* Add Vault Item Modal */}
      {isAddModalOpen && (
        <AddVaultItemModal
          masterKey={masterKey}
          beneficiaries={beneficiaries}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={fetchData}
        />
      )}

      {/* Interactive Encrypted Secret Editor & Attachment Modal */}
      <SecretEditorModal
        item={selectedItemForEdit}
        masterKey={masterKey}
        beneficiaries={beneficiaries}
        onClose={() => setSelectedItemForEdit(null)}
        onSuccess={fetchData}
      />

      {/* Header */}
      <div className="bg-[#151A20] border border-emerald-500/20 p-6 rounded-[32px] shadow-xl flex flex-col space-y-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3.5 bg-[#52B788]/15 rounded-2xl border border-[#52B788]/30 text-[#52B788]">
            <Vault className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#F4F1DE]">My Family Chest</h1>
            <p className="text-xs text-[#52B788] font-medium">
              Encrypted & Safe • Tap any item to edit, view or manage attachments
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#52B788] to-[#74C69D] hover:from-[#40A073] hover:to-[#52B788] text-[#0F1317] font-black text-xs tracking-wide transition-all shadow-[0_0_20px_rgba(82,183,136,0.3)] flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Add New Password or Confidential Note</span>
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="p-8 text-center bg-[#151A20] border border-white/5 rounded-3xl space-y-3">
            <Lock className="w-10 h-10 text-gray-500 mx-auto" />
            <h3 className="text-base font-bold text-white">Your Chest is Empty</h3>
            <p className="text-xs text-gray-400">
              Add your first confidential password, legal document, or personal message.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 bg-[#52B788] text-[#0F1317] text-xs font-bold rounded-xl mt-2 cursor-pointer"
            >
              Add First Secret
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4.5 rounded-3xl bg-[#151A20] border border-white/10 hover:border-[#52B788]/40 transition-all space-y-3 shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3.5">
                    <div className="p-3 bg-[#52B788]/15 rounded-2xl border border-[#52B788]/20 text-[#52B788]">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">{item.title}</h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="inline-block px-2.5 py-0.5 rounded-lg bg-white/10 text-[#74C69D] text-[10px] font-mono">
                          {item.category}
                        </span>
                        {!item.mimeType.startsWith("text/") && (
                          <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[#52B788]/20 text-[#74C69D] text-[10px] font-mono border border-[#52B788]/30">
                            📎 Attachment
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 text-gray-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => setSelectedItemForEdit(item)}
                  className="w-full py-3 px-4 rounded-2xl bg-[#52B788]/15 hover:bg-[#52B788]/25 text-[#74C69D] border border-[#52B788]/30 text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Edit & Manage Secret</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
