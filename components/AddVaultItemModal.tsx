"use client";

import React, { useState } from "react";
import { Lock, Upload, FileText, X, AlertTriangle } from "lucide-react";
import { packAndEncryptSecretPayload } from "@/lib/crypto/payloadCodec";

interface AddVaultItemModalProps {
  isOpen: boolean;
  masterKey: CryptoKey | null;
  onClose: () => void;
  onItemAdded: () => void;
}

export function AddVaultItemModal({ isOpen, masterKey, onClose, onItemAdded }: AddVaultItemModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"passwords" | "finance" | "legal" | "personal">("finance");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileBuffer(reader.result as ArrayBuffer);
      setSelectedFile(file);
      setError("");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterKey) {
      setError("Master Key is not unlocked.");
      return;
    }

    if (!title) {
      setError("Please provide a title.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Pack and encrypt unified structured payload
      const { ciphertextHex, ivHex } = await packAndEncryptSecretPayload(
        notes,
        fileBuffer,
        selectedFile ? selectedFile.type || "application/octet-stream" : "",
        selectedFile ? selectedFile.name : "",
        masterKey
      );

      // Save encrypted item to backend
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          ciphertextHex,
          ivHex,
          mimeType: selectedFile ? selectedFile.type : "text/plain",
          encryptedChestKeyHex: "",
        }),
      });

      const data = await res.json();
      if (data.success) {
        onItemAdded();
        onClose();
        setTitle("");
        setNotes("");
        setSelectedFile(null);
        setFileBuffer(null);
      } else {
        setError(data.error || "Failed to save item.");
      }
    } catch (err: any) {
      setError(err?.message || "Encryption error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-[28px] max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Add to Family Chest</h3>
              <p className="text-xs text-slate-500">Client-encrypted with AES-256-GCM</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Asset Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Primary Banking Vault & Crypto Seed"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
            >
              <option value="finance">Financial Assets & Crypto</option>
              <option value="passwords">Master Passwords & Credentials</option>
              <option value="legal">Legal Documents & Wills</option>
              <option value="personal">Personal Letters & Memories</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Secret Notes / Passwords</label>
            <textarea
              rows={4}
              placeholder="Enter sensitive instructions, PIN codes, account details, or seed phrases..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Document Attachment (Optional PDF / Image)
            </label>
            {selectedFile ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 truncate max-w-[200px]">{selectedFile.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setFileBuffer(null);
                  }}
                  className="text-rose-600 hover:text-rose-800 text-xs font-bold"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
                <Upload className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs font-bold text-slate-700">Choose a file to attach</span>
                <span className="text-[10px] text-slate-500">PDF, JPG, PNG up to 10MB</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,image/*"
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? "Encrypting..." : "Encrypt & Store"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
