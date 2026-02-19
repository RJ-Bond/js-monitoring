"use client";

import { AlertTriangle, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Server } from "@/types/server";

interface DeleteConfirmModalProps {
  server: Server;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteConfirmModal({ server, onConfirm, onClose }: DeleteConfirmModalProps) {
  const { t } = useLanguage();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="font-bold text-base text-foreground">{t.deleteModalTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.deleteModalDesc(server.title)}
          </p>
          <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-foreground truncate">{server.title}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              {server.display_ip || server.ip}:{server.port}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all"
          >
            {t.newsCancel}
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500/90 text-white hover:bg-red-500 transition-all"
          >
            {t.deleteModalConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
