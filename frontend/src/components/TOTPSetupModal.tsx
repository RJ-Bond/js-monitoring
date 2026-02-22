"use client";

import { useState } from "react";
import { X, Shield, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/toast";

interface TOTPSetupModalProps {
  onClose: () => void;
  onEnabled: () => void;
}

export default function TOTPSetupModal({ onClose, onEnabled }: TOTPSetupModalProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<"loading" | "qr" | "confirm">("loading");
  const [qrUrl, setQrUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useState(() => {
    api.generateTOTP().then((data) => {
      setQrUrl(data.qr_url);
      setSecret(data.secret);
      setStep("qr");
    }).catch(() => setStep("qr"));
  });

  const confirm = async () => {
    setError(""); setSaving(true);
    try {
      await api.enableTOTP(code);
      toast(t.twoFaSuccess);
      onEnabled();
      onClose();
    } catch {
      setError(t.twoFaInvalidCode);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm relative animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-5 h-5 text-neon-blue" />
          <h2 className="text-lg font-bold text-foreground">{t.twoFaTitle}</h2>
        </div>

        {step === "loading" && (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        )}

        {step === "qr" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t.twoFaStep1}</p>
            {qrUrl && (
              <div className="flex justify-center">
                <img src={qrUrl} alt="QR" className="w-48 h-48 rounded-lg border border-white/10" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t.twoFaSecretLabel}</span>
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                <code className="text-xs text-foreground flex-1 break-all font-mono">{secret}</code>
                <button onClick={() => { navigator.clipboard.writeText(secret); toast(t.embedCopied); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <button onClick={() => setStep("confirm")} className="w-full py-2.5 rounded-xl bg-neon-blue/20 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/30 transition-colors text-sm font-semibold">
              {t.twoFaConfirm} →
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t.twoFaCodeLabel}</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder={t.twoFaCodePlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-mono text-foreground focus:outline-none focus:border-neon-blue/50 transition-colors"
            />
            {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2 text-center">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep("qr")} className="flex-1 py-2.5 rounded-xl text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors text-sm">
                ←
              </button>
              <button onClick={confirm} disabled={saving || code.length !== 6} className="flex-1 py-2.5 rounded-xl bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-colors text-sm font-semibold disabled:opacity-50">
                {saving ? "…" : t.twoFaConfirm}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
