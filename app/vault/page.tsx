"use client";

import React, { useState, useEffect } from "react";
import { VaultItemRecord } from "@/lib/state/mockDatabase";
import { PassphraseModal } from "@/components/PassphraseModal";
import { AddVaultItemModal } from "@/components/AddVaultItemModal";
import { SecretEditorModal } from "@/components/SecretEditorModal";
import { Key, Lock, Plus, FileText, ShieldCheck, Edit3 } from "lucide-react";
import { decryptAndUnpackSecretPayload, UnpackedSecretResult } from "@/lib/crypto/payloadCodec";

export default function VaultPage() {
  const [items, setItems] = useState<VaultItemRecord[]>([]);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [isPassphraseModalOpen, setIsPassphraseModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [activeEditorItem, setActiveEditorItem] = useState<VaultItemRecord | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, UnpackedSecretResult>>({});
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await fetch("/api/vault");
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("Fetch items error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleKeyDerived = (key: CryptoKey) => {
    setMasterKey(key);
  };

  const handleOpenItem = async (item: VaultItemRecord) => {
    if (!masterKey) {
      setIsPassphraseModalOpen(true);
      return;
    }

    try {
      const result = await decryptAndUnpackSecretPayload(item.ciphertextHex, item.ivHex, masterKey);

      setDecryptedCache((prev) => ({
        ...prev,
        [item.id]: result,
      }));

      setActiveEditorItem(item);
      setIsEditorModalOpen(true);
    } catch (err: any) {
      console.error("Decryption error:", err);
      alert("Failed to decrypt item with current Master Key.");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Master Key State */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Lock className="w-6 h-6 text-emerald-600" />
            <span>My Family Chest</span>
          </h2>
          <p className="text-xs text-slate-500">
            Encrypted with zero-knowledge AES-256-GCM.
          </p>
        </div>

        {masterKey ? (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Vault Unlocked</span>
          </div>
        ) : (
          <button
            onClick={() => setIsPassphraseModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Key className="w-4 h-4" />
            <span>Unlock Vault</span>
          </button>
        )}
      </div>

      {/* Add New Item Button */}
      <button
        onClick={() => {
          if (!masterKey) {
            setIsPassphraseModalOpen(true);
          } else {
            setIsAddModalOpen(true);
          }
        }}
        className="w-full py-4 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-dashed border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-2xs hover:border-emerald-500 hover:text-emerald-700"
      >
        <Plus className="w-5 h-5 text-emerald-600" />
        <span>Add New Asset, Password, or Document</span>
      </button>

      {/* Vault Items Grid */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-3xl p-6">
            <p className="font-bold text-slate-800 text-sm">Your chest is empty</p>
            <p className="mt-1">Add your first secret or document to protect your digital legacy.</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleOpenItem(item)}
              className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/60 hover:shadow-md transition-all cursor-pointer group shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-emerald-800 transition-colors">
                      {item.title}
                    </h3>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {item.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 transition-all text-xs font-bold flex items-center space-x-1.5">
                    <Edit3 className="w-4 h-4" />
                    <span>View / Edit</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      <PassphraseModal
        isOpen={isPassphraseModalOpen}
        onClose={() => setIsPassphraseModalOpen(false)}
        onKeyDerived={handleKeyDerived}
      />

      <AddVaultItemModal
        isOpen={isAddModalOpen}
        masterKey={masterKey}
        onClose={() => setIsAddModalOpen(false)}
        onItemAdded={fetchItems}
      />

      {activeEditorItem && masterKey && (
        <SecretEditorModal
          isOpen={isEditorModalOpen}
          item={activeEditorItem}
          masterKey={masterKey}
          initialResult={decryptedCache[activeEditorItem.id]}
          onClose={() => {
            setIsEditorModalOpen(false);
            setActiveEditorItem(null);
          }}
          onSaveSuccess={() => {
            setIsEditorModalOpen(false);
            setActiveEditorItem(null);
            fetchItems();
          }}
        />
      )}
    </div>
  );
}
