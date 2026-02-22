"use client";

import { useState, useEffect } from "react";
import { X, MessageSquare, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/toast";
import type { DiscordConfig } from "@/types/server";

interface Props {
  serverID: number;
  serverName: string;
  onClose: () => void;
}

export default function DiscordConfigModal({ serverID, serverName, onClose }: Props) {
  const { t } = useLanguage();
  const [cfg, setCfg] = useState<DiscordConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [interval, setInterval_] = useState(5);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.getDiscordConfig(serverID).then((data) => {
      setCfg(data);
      setEnabled(data.enabled);
      setWebhookUrl(data.webhook_url ?? "");
      setInterval_(data.update_interval ?? 5);
    });
  }, [serverID]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateDiscordConfig(serverID, {
        enabled,
        webhook_url: webhookUrl,
        update_interval: interval,
      });
      setCfg(updated);
      toast(t.discordSaved);
      onClose();
    } catch {
      toast(t.discordTestFail);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!webhookUrl) return;
    setTesting(true);
    try {
      // Save first so test endpoint has the latest URL
      const updated = await api.updateDiscordConfig(serverID, {
        enabled,
        webhook_url: webhookUrl,
        update_interval: interval,
      });
      setCfg(updated);
      await api.testDiscordConfig(serverID);
      toast(t.discordTestOk);
    } catch {
      toast(t.discordTestFail);
    } finally {
      setTesting(false);
    }
  };

  const inputCls =
    "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-neon-blue/50 transition-colors w-full";

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
          <MessageSquare className="w-5 h-5 text-[#5865F2]" />
          <h2 className="text-lg font-bold text-foreground">{t.discordTitle}</h2>
          <span className="text-sm text-muted-foreground truncate">— {serverName}</span>
        </div>

        {cfg === null ? (
          <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setEnabled((v) => !v)}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? "bg-[#5865F2]" : "bg-white/20"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-foreground">{t.discordEnabled}</span>
            </label>

            {/* Webhook URL */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">{t.discordWebhookUrl}</label>
                <a
                  href="https://support.discord.com/hc/en-us/articles/228383668"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#5865F2] hover:underline flex items-center gap-0.5"
                >
                  Как получить?
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={inputCls}
              />
              <p className="text-[11px] text-muted-foreground/60">{t.discordWebhookUrlHint}</p>
            </div>

            {/* Update interval */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t.discordUpdateInterval}</label>
              <input
                type="number"
                min={1}
                max={60}
                value={interval}
                onChange={(e) => setInterval_(Number(e.target.value))}
                className={`${inputCls} w-24`}
              />
            </div>

            {/* Message ID (info) */}
            {cfg.message_id && (
              <p className="text-[11px] text-muted-foreground/60">
                {t.discordMessageIdHint}: <span className="font-mono">{cfg.message_id}</span>
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/30 hover:bg-[#5865F2]/30 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "…" : t.discordSave}
              </button>
              <button
                onClick={test}
                disabled={testing || !webhookUrl}
                className="px-4 py-2 rounded-lg bg-neon-green/10 text-neon-green border border-neon-green/20 hover:bg-neon-green/20 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {testing ? "…" : t.discordTest}
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
