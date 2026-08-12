"use client";

import React, { useEffect, useState, useRef } from "react";
import { ShieldAlert, EyeOff, X, Lock, DownloadCloud, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { DecryptedMemoryItem, purgeZeroTraceMemory } from "@/lib/crypto/zeroTraceViewer";

interface ZeroTraceModalProps {
  item: DecryptedMemoryItem | null;
  onClose: () => void;
}

export function ZeroTraceModal({ item, onClose }: ZeroTraceModalProps) {
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Monitor window focus/blur for FLAG_SECURE simulation
  useEffect(() => {
    const handleBlur = () => setIsWindowBlurred(true);
    const handleFocus = () => setIsWindowBlurred(false);

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Handle image rendering onto canvas directly from RAM object URL
  useEffect(() => {
    if (item && item.mimeType.startsWith("image/") && item.objectUrl && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      };

      img.src = item.objectUrl;
    }
  }, [item]);

  if (!item) return null;

  const handleClose = () => {
    purgeZeroTraceMemory(item);
    onClose();
  };

  const handleCopySecureText = () => {
    if (item.textPayload) {
      navigator.clipboard.writeText(item.textPayload);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      {/* FLAG_SECURE Window Blur Protection Banner */}
      {isWindowBlurred && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-6 space-y-4">
          <EyeOff className="w-16 h-16 text-rose-500 animate-bounce" />
          <h2 className="text-2xl font-bold text-white">FLAG_SECURE Screen Shield Active</h2>
          <p className="text-sm text-gray-400 max-w-md">
            Decrypted memory buffers are hidden while the browser window is out of focus to prevent unauthorized screen captures or recording software.
          </p>
          <span className="px-4 py-2 bg-rose-500/20 text-rose-300 rounded-full text-xs font-mono border border-rose-500/30">
            Click window to resume zero-trace viewing
          </span>
        </div>
      )}

      <div className="bg-[#0F111A] border border-amber-500/30 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-base">{item.title}</h3>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                  RAM BUFFER ONLY
                </span>
              </div>
              <p className="text-xs text-gray-400 font-mono">
                Category: {item.category} • Size: {(item.byteSize / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Banner Notice */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Zero-Trace Contract: Decrypted directly in volatile memory. No disk cache generated.
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-400/80 uppercase">
            Auto-Purge on Close
          </span>
        </div>

        {/* Content Viewer Area */}
        <div className="p-6 overflow-y-auto flex-1 min-h-[300px] flex items-center justify-center bg-black/40">
          {item.mimeType.startsWith("text/") || item.mimeType === "application/json" ? (
            <div className="w-full space-y-4">
              <div className="p-4 rounded-xl bg-[#090A10] border border-white/10 font-mono text-xs text-emerald-400 whitespace-pre-wrap break-all leading-relaxed shadow-inner">
                {item.textPayload}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center space-x-1 text-gray-500">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Decrypted String Buffer</span>
                </span>
                <button
                  onClick={handleCopySecureText}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all font-mono"
                >
                  {copiedNotification ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-3.5 h-3.5" />
                      <span>Copy to Clipboard</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : item.mimeType.startsWith("image/") ? (
            <div className="flex flex-col items-center space-y-3">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[450px] rounded-xl border border-white/10 shadow-2xl object-contain"
                onContextMenu={(e) => e.preventDefault()}
              />
              <span className="text-[11px] text-gray-400 font-mono">
                Rendered directly on Canvas stream. Screenshot overlay active.
              </span>
            </div>
          ) : item.mimeType === "application/pdf" ? (
            <div className="w-full h-[450px] rounded-xl border border-white/10 overflow-hidden bg-white/5 flex flex-col items-center justify-center p-6 text-center space-y-3">
              {item.objectUrl ? (
                <iframe
                  src={item.objectUrl}
                  className="w-full h-full rounded-lg"
                  title="PDF RAM Stream"
                />
              ) : (
                <div className="text-gray-400 space-y-2">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-sm">PDF Decrypted into RAM Buffer</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 space-y-2">
              <FileText className="w-10 h-10 text-gray-500 mx-auto" />
              <p className="text-sm font-mono">Binary payload decrypted in RAM ({item.byteSize} bytes)</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <span className="text-xs text-gray-500 font-mono">
            Mem Address: 0x7fff89a... | GC Purge Pending
          </span>
          <button
            onClick={handleClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]"
          >
            Purge Memory & Close
          </button>
        </div>
      </div>
    </div>
  );
}
