"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { AuthResponse } from "@/types/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError(t.authPasswordMismatch); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, email: form.email, password: form.password }),
      });
      if (!res.ok) { const d = await res.json() as { error: string }; throw new Error(d.error); }
      const data = await res.json() as AuthResponse;
      login(data.token, data.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally { setLoading(false); }
  };

  const field = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-neon-green/20 border border-neon-green/40 rounded-2xl flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-neon-green" />
          </div>
          <h1 className="text-2xl font-black">JS<span className="text-neon-green">Monitor</span></h1>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.authUsername}</label>
              <input className={field} placeholder={t.authUsernamePlaceholder} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.authEmail}</label>
              <input className={field} type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.authPassword}</label>
              <input className={field} type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.authConfirmPassword}</label>
              <input className={field} type="password" placeholder="••••••••" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
            {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50">
              <UserPlus className="w-4 h-4" />
              {loading ? t.authRegistering : t.authRegister}
            </button>
          </form>
          <div className="mt-4 text-center">
            <a href="/login" className="text-xs text-muted-foreground hover:text-neon-green transition-colors">{t.authHaveAccount}</a>
          </div>
        </div>
        <div className="flex justify-center mt-4"><LanguageSwitcher /></div>
      </div>
    </div>
  );
}
