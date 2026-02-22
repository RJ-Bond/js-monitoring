"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import SiteBrand from "@/components/SiteBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function ResetPasswordForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError(t.resetPasswordExpired);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError(t.resetPasswordExpired);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-white/5">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <SiteBrand size="sm" />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="glass-card rounded-2xl p-8">
            <div className="flex flex-col items-center gap-2 mb-6">
              <KeyRound className="w-8 h-8 text-neon-blue" />
              <h1 className="text-xl font-bold text-foreground">{t.resetPasswordTitle}</h1>
            </div>

            {success ? (
              <div className="flex flex-col items-center gap-3 text-center py-4">
                <CheckCircle2 className="w-12 h-12 text-neon-green" />
                <p className="text-foreground font-semibold">{t.resetPasswordSuccess}</p>
                <p className="text-sm text-muted-foreground">Redirecting to login…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{t.resetPasswordNew}</label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-neon-blue/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{t.resetPasswordConfirm}</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-neon-blue/50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full py-2.5 rounded-lg bg-neon-blue/20 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/30 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? "…" : t.resetPasswordTitle}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
