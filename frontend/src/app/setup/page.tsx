"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.setupStatus()
      .then(({ needed }) => {
        if (!needed) {
          router.replace("/");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError(t.setupMismatch);
      return;
    }
    if (form.password.length < 6) {
      setError(t.setupTooShort);
      return;
    }
    setLoading(true);
    try {
      const res = await api.setupAdmin(form.username, form.password);
      login(res.token, res.user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  const field = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-neon-green/20 border border-neon-green/40 rounded-2xl flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-neon-green" />
          </div>
          <h1 className="text-2xl font-black">JS<span className="text-neon-green">Monitor</span></h1>
          <p className="text-sm text-muted-foreground text-center">{t.setupSubtitle}</p>
        </div>

        <div className="glass-card rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-neon-green text-sm font-semibold">
            <ShieldCheck className="w-4 h-4" />
            {t.setupTitle}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.setupUsername}</label>
              <input
                className={field}
                placeholder="admin"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.setupPassword}</label>
              <input
                className={field}
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.setupConfirm}</label>
              <input
                className={field}
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !form.username || !form.password}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? t.setupBtnLoading : t.setupBtn}
            </button>
          </form>
        </div>

        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
