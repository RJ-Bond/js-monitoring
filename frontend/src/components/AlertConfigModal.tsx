"use client";

import { useState, useEffect } from "react";
import { X, Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/toast";
import type { AlertConfig } from "@/types/server";

interface AlertConfigModalProps {
  serverID: number;
  serverName: string;
  onClose: () => void;
}

export default function AlertConfigModal({ serverID, serverName, onClose }: AlertConfigModalProps) {
  const { t } = useLanguage();
  const [cfg, setCfg] = useState<AlertConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [chatID, setChatID] = useState("");
  const [timeout, setTimeout_] = useState(5);
  const [notifyOnline, setNotifyOnline] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAlertConfig(serverID).then((data) => {
      setCfg(data);
      setEnabled(data.enabled);
      setChatID(data.tg_chat_id ?? "");
      setTimeout_(data.offline_timeout ?? 5);
      setNotifyOnline(data.notify_online ?? false);
      setEmailTo(data.email_to ?? "");
    });
  }, [serverID]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateAlertConfig(serverID, {
        enabled,
        tg_chat_id: chatID,
        offline_timeout: timeout,
        notify_online: notifyOnline,
        email_to: emailTo,
      });
      setCfg(updated);
      toast(t.alertsSaved);
      onClose();
    } catch {
      toast("Error saving alert config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md relative animate-slide-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Bell className="w-5 h-5 text-neon-blue" />
          <h2 className="text-lg font-bold text-foreground">{t.alertsTitle}</h2>
          <span className="text-sm text-muted-foreground truncate">— {serverName}</span>
        </div>

        {cfg === null ? (
          <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setEnabled((v) => !v)}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? "bg-neon-green" : "bg-white/20"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-foreground">{t.alertsEnabled}</span>
            </label>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t.alertsTgChatId}</label>
              <input
                type="text"
                value={chatID}
                onChange={(e) => setChatID(e.target.value)}
                placeholder="-100123456789"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-neon-blue/50 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t.alertsTimeout}</label>
              <input
                type="number"
                min={1}
                max={60}
                value={timeout}
                onChange={(e) => setTimeout_(Number(e.target.value))}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-neon-blue/50 transition-colors w-24"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setNotifyOnline((v) => !v)}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${notifyOnline ? "bg-neon-green" : "bg-white/20"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${notifyOnline ? "translate-x-5" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-foreground">{t.alertsNotifyOnline}</span>
            </label>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t.alertsEmailTo}</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="alerts@example.com"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-neon-blue/50 transition-colors"
              />
              <span className="text-xs text-muted-foreground">{t.alertsEmailToHint}</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-neon-blue/20 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/30 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "…" : t.alertsSave}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
