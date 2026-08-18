"use client";

import React, { useState } from "react";
import { VaultItemRecord } from "@/lib/state/mockDatabase";
import { packAndEncryptSecretPayload, UnpackedSecretResult } from "@/lib/crypto/payloadCodec";
import { Lock, Save, Download, Trash2, Upload, FileText, X, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SecretEditorModalProps {
  isOpen: boolean;
  item: VaultItemRecord;
  masterKey: CryptoKey;
  initialResult?: UnpackedSecretResult;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export function SecretEditorModal({
  isOpen,
  item,
  masterKey,
  initialResult,
  onClose,
  onSaveSuccess,
}: SecretEditorModalProps) {
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const [notes, setNotes] = useState(initialResult?.textNotes || "");
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(initialResult?.fileBuffer || null);
  const [fileName, setFileName] = useState<string>(initialResult?.fileName || "");
  const [fileMimeType, setFileMimeType] = useState<string>(initialResult?.fileMimeType || "application/octet-stream");

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("File size exceeds 10MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileBuffer(reader.result as ArrayBuffer);
      setFileName(file.name);
      setFileMimeType(file.type || "application/octet-stream");
      setErrorMsg("");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadAttachment = () => {
    if (!fileBuffer) return;
    try {
      const blob = new Blob([fileBuffer], { type: fileMimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "virasat-document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      setErrorMsg("Failed to download attachment.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const { ciphertextHex, ivHex } = await packAndEncryptSecretPayload(
        notes,
        fileBuffer,
        fileMimeType,
        fileName,
        masterKey
      );

      const res = await fetch("/api/vault", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          title,
          category,
          ciphertextHex,
          ivHex,
          mimeType: fileMimeType,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Changes encrypted and saved successfully!");
        setTimeout(() => {
          onSaveSuccess();
        }, 800);
      } else {
        setErrorMsg(data.error || "Failed to update item.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Encryption error while saving.");
    } finally {
      setIsSaving(false);
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
              <h3 className="text-base font-extrabold text-slate-900">View & Edit Secret</h3>
              <p className="text-xs text-slate-500">Decrypted volatile session view</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
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
              <option value="Finance">Financial Assets & Crypto</option>
              <option value="Credentials">Master Passwords & Credentials</option>
              <option value="Legal Estate">Legal Documents & Wills</option>
              <option value="Private Note">Personal Letters & Memories</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Plaintext Notes & Secret Content (Editable)
            </label>
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter your confidential notes..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Decrypted Attachment (PDF / Image)
            </label>
            {fileBuffer ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-900 truncate max-w-[170px]">
                    {fileName || "attachment.pdf"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    ({(fileBuffer.byteLength / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadAttachment}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center space-x-1 border border-emerald-200"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFileBuffer(null);
                      setFileName("");
                      setFileMimeType("");
                    }}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center space-x-1 border border-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
                <Upload className="w-5 h-5 text-slate-400 mb-1" />
                <span className="text-xs font-bold text-slate-700">Upload new PDF/Image</span>
                <span className="text-[10px] text-slate-500">Attach file to this encrypted secret</span>
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
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? "Encrypting & Saving..." : "Save Changes"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
