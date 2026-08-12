"use client";

import React, { useState, useEffect } from "react";
import { Lock, X, Key, ShieldCheck, Download, Trash2, Upload, FileText, CheckCircle2, Copy, Save } from "lucide-react";
import { generateChestKey, exportKeyToHex } from "@/lib/crypto/aes-gcm";
import { encryptChestKeyForBeneficiary, importPublicKeyFromPem } from "@/lib/crypto/asymmetric";
import { packAndEncryptSecretPayload, decryptAndUnpackSecretPayload } from "@/lib/crypto/payloadCodec";
import { VaultItemRecord } from "@/lib/state/mockDatabase";

interface SecretEditorModalProps {
  item: VaultItemRecord | null;
  masterKey: CryptoKey | null;
  beneficiaries: { id: string; name: string; publicKeyPem: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export function SecretEditorModal({
  item,
  masterKey,
  beneficiaries,
  onClose,
  onSuccess,
}: SecretEditorModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"Credentials" | "Private Note" | "Document" | "Crypto Key" | "Legal Estate">("Credentials");
  const [plaintextPayload, setPlaintextPayload] = useState("");
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState("");

  // File Attachment State
  const [hasExistingFile, setHasExistingFile] = useState(false);
  const [fileMimeType, setFileMimeType] = useState("application/pdf");
  const [fileName, setFileName] = useState("attachment");
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [newUploadFile, setNewUploadFile] = useState<File | null>(null);

  const [isDecrypting, setIsDecrypting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  useEffect(() => {
    if (!item || !masterKey) return;

    const decryptItemFields = async () => {
      setIsDecrypting(true);
      setTitle(item.title);
      setCategory(item.category);
      setSelectedBeneficiaryId(item.assignedBeneficiaryIds[0] || "");

      try {
        const unpacked = await decryptAndUnpackSecretPayload(item.ciphertextHex, item.ivHex, masterKey);

        setPlaintextPayload(unpacked.textNotes || "");

        if (unpacked.fileBuffer) {
          setHasExistingFile(true);
          setFileBuffer(unpacked.fileBuffer);
          setFileMimeType(unpacked.fileMimeType || item.mimeType || "application/pdf");
          setFileName(unpacked.fileName || "attachment");
        } else {
          setHasExistingFile(false);
          setFileBuffer(null);
        }
      } catch (err) {
        console.error("[Secret Editor] Decryption failed:", err);
        setPlaintextPayload("Error decrypting content. Please check your passphrase.");
      } finally {
        setIsDecrypting(false);
      }
    };

    decryptItemFields();
  }, [item, masterKey]);

  if (!item) return null;

  const handleDownloadFile = () => {
    if (!fileBuffer) return;
    const blob = new Blob([fileBuffer], { type: fileMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = fileMimeType === "application/pdf" ? "pdf" : fileMimeType.split("/")[1] || "bin";
    a.download = `${(fileName || title).toLowerCase().replace(/[^a-z0-9]/g, "_")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteAttachment = () => {
    if (confirm("Remove file attachment from this secret?")) {
      setHasExistingFile(false);
      setFileBuffer(null);
      setNewUploadFile(null);
    }
  };

  const handleCopyText = () => {
    if (plaintextPayload) {
      navigator.clipboard.writeText(plaintextPayload);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  const handleNewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewUploadFile(e.target.files[0]);
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterKey || !item) return;

    setIsSaving(true);
    try {
      let finalFileBuffer: ArrayBuffer | null = fileBuffer;
      let finalMimeType = fileMimeType;
      let finalFileName = fileName;

      if (newUploadFile) {
        finalMimeType = newUploadFile.type || "application/octet-stream";
        finalFileName = newUploadFile.name;
        finalFileBuffer = await newUploadFile.arrayBuffer();
      } else if (!hasExistingFile) {
        finalFileBuffer = null;
        finalMimeType = "text/plain";
      }

      // 1. Pack text notes + file attachment together and encrypt with Master Key (K_master)
      const encryptedPayloadResult = await packAndEncryptSecretPayload(
        plaintextPayload,
        finalFileBuffer,
        finalMimeType,
        finalFileName,
        masterKey
      );

      // 2. Generate K_chest & encrypt for Beneficiary envelope if assigned
      const chestKey = await generateChestKey();
      const chestKeyHex = await exportKeyToHex(chestKey);

      const ben = beneficiaries.find((b) => b.id === selectedBeneficiaryId);
      let benEnvelopeHex = "";
      if (ben && ben.publicKeyPem) {
        try {
          const benPubKey = await importPublicKeyFromPem(ben.publicKeyPem);
          benEnvelopeHex = await encryptChestKeyForBeneficiary(chestKeyHex, benPubKey);
        } catch {
          benEnvelopeHex = `E_ben_demo_${chestKeyHex}`;
        }
      }

      // 3. Save updated encrypted record to backend API
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          title,
          category,
          mimeType: finalMimeType,
          ciphertextHex: encryptedPayloadResult.ciphertextHex,
          ivHex: encryptedPayloadResult.ivHex,
          encryptedChestKeyHex: benEnvelopeHex || `E_ben_demo_${chestKeyHex}`,
          assignedBeneficiaryIds: selectedBeneficiaryId ? [selectedBeneficiaryId] : [],
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error("[Secret Editor] Save error:", err);
      alert("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#121422] border border-amber-500/30 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Edit & View Secret</h3>
              <p className="text-xs text-amber-400 font-mono">End-to-End Encrypted Payload</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isDecrypting ? (
          <div className="py-12 text-center text-gray-400 space-y-2">
            <Lock className="w-8 h-8 text-amber-400 animate-bounce mx-auto" />
            <p className="text-xs font-mono">Decrypting notes & attachments in RAM...</p>
          </div>
        ) : saveSuccess ? (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-lg font-bold text-white">Changes Encrypted & Saved!</h4>
            <p className="text-xs text-gray-400">Your updated notes and attachments are securely saved.</p>
          </div>
        ) : (
          <form onSubmit={handleSaveChanges} className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Secret Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white text-xs font-bold focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Category & Beneficiary */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white text-xs focus:border-amber-500 focus:outline-none"
                >
                  <option value="Credentials">Credentials</option>
                  <option value="Private Note">Private Note</option>
                  <option value="Document">Document</option>
                  <option value="Crypto Key">Crypto Key</option>
                  <option value="Legal Estate">Legal Estate</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Assigned Loved One</label>
                <select
                  value={selectedBeneficiaryId}
                  onChange={(e) => setSelectedBeneficiaryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white text-xs focus:border-amber-500 focus:outline-none"
                >
                  <option value="">-- None --</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Plaintext Notes Editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-300">
                  Decrypted Secret Notes / Passwords
                </label>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex items-center space-x-1 text-[11px] text-amber-400 hover:text-amber-300 font-mono cursor-pointer"
                >
                  {copiedNotification ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedNotification ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <textarea
                rows={4}
                value={plaintextPayload}
                onChange={(e) => setPlaintextPayload(e.target.value)}
                placeholder="Enter confidential passcodes, seed phrases, or private notes..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-emerald-400 font-mono text-xs focus:border-amber-500 focus:outline-none leading-relaxed"
              />
            </div>

            {/* File Attachment Controls */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <span className="text-xs font-bold text-gray-200 block">File Attachment Management</span>

              {hasExistingFile && fileBuffer ? (
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block truncate max-w-[180px]">
                        {fileName || "File Attachment"}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {fileMimeType === "application/pdf" ? "PDF" : "Image"} • {(fileBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleDownloadFile}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                      title="Download file to device"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteAttachment}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer"
                      title="Delete attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] text-gray-400">
                    Upload or attach file (PDF, PNG, JPG):
                  </label>
                  <input
                    type="file"
                    onChange={handleNewFileChange}
                    className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-500/10 file:text-amber-400 hover:file:bg-amber-500/20 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Submit Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-black font-extrabold text-xs transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? "Re-encrypting..." : "Save Changes & Re-encrypt"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
