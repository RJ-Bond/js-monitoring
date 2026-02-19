"use client";

import { useState, useEffect } from "react";
import { X, Plus, Save } from "lucide-react";
import { useCreateServer } from "@/hooks/useServers";
import { useLanguage } from "@/contexts/LanguageContext";
import { GAME_META, gameTypeDefaultPort } from "@/lib/utils";
import type { GameType, Server } from "@/types/server";
import GameIcon from "./GameIcon";

interface AddEditServerModalProps {
  onClose: () => void;
  editServer?: Server; // if provided → edit mode
  onUpdate?: (data: Partial<Server>) => void;
}

const GAME_OPTIONS = Object.entries(GAME_META).map(([value, meta]) => ({
  value: value as GameType,
  label: `${meta.icon} ${meta.label}`,
  defaultPort: meta.defaultPort,
}));

export default function AddEditServerModal({ onClose, editServer, onUpdate }: AddEditServerModalProps) {
  const { t } = useLanguage();
  const { mutate: createServer, isPending } = useCreateServer();
  const isEdit = !!editServer;

  const [form, setForm] = useState({
    title: editServer?.title ?? "",
    ip: editServer?.ip ?? "",
    port: String(editServer?.port ?? 27015),
    game_type: (editServer?.game_type ?? "source") as GameType,
    secret_rcon_key: "",
  });
  const [error, setError] = useState("");

  // Auto-fill default port when game type changes (only in add mode)
  useEffect(() => {
    if (!isEdit) {
      setForm((f) => ({ ...f, port: String(gameTypeDefaultPort(f.game_type)) }));
    }
  }, [form.game_type, isEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title || !form.ip) { setError(t.fieldRequired); return; }

    const data = { ...form, port: Number(form.port) };

    if (isEdit && onUpdate) {
      onUpdate(data);
      onClose();
    } else {
      createServer(data, { onSuccess: onClose, onError: (err) => setError(err.message) });
    }
  };

  const field = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";
  // browsers ignore rgba/transparent bg on <select> — use a solid dark colour
  const selectField = "w-full bg-[#0d0d18] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-bold text-base">{isEdit ? `✏️ ${editServer?.title}` : t.modalTitle}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.fieldName}</label>
            <input className={field} placeholder={t.fieldNamePlaceholder} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.fieldIp}</label>
              <input className={field} placeholder="192.168.1.1" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.fieldPort}</label>
              <input className={field} type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.fieldGameType}</label>
            <div className="flex items-center gap-2">
              <GameIcon
                gameType={form.game_type}
                imgClassName="h-6 w-auto max-w-[4rem] object-contain rounded-sm flex-shrink-0"
                emojiClassName="text-xl leading-none flex-shrink-0"
              />
              <select className={`${selectField} flex-1`} value={form.game_type} onChange={(e) => setForm({ ...form, game_type: e.target.value as GameType })}>
                {GAME_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label} (:{g.defaultPort})</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.fieldRcon}</label>
            <input className={field} placeholder="••••••••" type="password" value={form.secret_rcon_key} onChange={(e) => setForm({ ...form, secret_rcon_key: e.target.value })} />
          </div>
          {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all">
              {t.btnCancel}
            </button>
            <button type="submit" disabled={isPending} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {isEdit ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isPending ? t.btnAdding : isEdit ? t.btnAdd : t.btnAdd}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
