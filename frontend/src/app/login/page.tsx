"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SiteBrand from "@/components/SiteBrand";
import { api } from "@/lib/api";
import type { AuthResponse } from "@/types/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.187.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.711L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
    </svg>
  );
}

// Inner component that uses useSearchParams — must be inside <Suspense>
function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { t } = useLanguage();
  const { steamEnabled } = useSiteSettings();
  const [form, setForm] = useState({ username: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [twoFaMode, setTwoFaMode] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    const errParam = searchParams.get("error");
    if (errParam === "banned") setError("Your account has been banned.");
    else if (errParam === "steam_failed") setError("Steam authentication failed. Please try again.");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json() as { error: string }; throw new Error(d.error); }
      const data = await res.json() as AuthResponse & { requires_2fa?: boolean; temp_token?: string };
      if (data.requires_2fa && data.temp_token) {
        setTempToken(data.temp_token);
        setTwoFaMode(true);
        return;
      }
      login(data.token, data.user, remember);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await api.verify2FA(tempToken, totpCode);
      login(data.token, data.user, remember);
      router.push("/");
    } catch {
      setError(t.twoFaInvalidCode);
    } finally { setLoading(false); }
  };

  const field = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <SiteBrand size="lg" className="scale-125" />
        </div>

        <div className="glass-card rounded-2xl p-6 flex flex-col gap-4">
          {twoFaMode ? (
            <form onSubmit={handleVerify2FA} className="flex flex-col gap-4">
              <div className="text-center">
                <div className="text-2xl mb-2">🔐</div>
                <h2 className="font-bold text-foreground">{t.twoFaLoginTitle}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t.twoFaLoginHint}</p>
              </div>
              <input
                className={field}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder={t.twoFaCodePlaceholder}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
              {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading || totpCode.length !== 6} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50">
                {loading ? t.twoFaLoginVerifying : t.twoFaLoginVerify}
              </button>
              <button type="button" onClick={() => { setTwoFaMode(false); setTotpCode(""); setError(""); }} className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors">
                {t.twoFaLoginBack}
              </button>
            </form>
          ) : (
          <>
          {steamEnabled && (
            <>
              <a
                href={`${BASE}/api/v1/auth/steam`}
                className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl font-semibold text-sm bg-[#1b2838] text-white border border-[#2a475e] hover:bg-[#2a475e] transition-all"
              >
                <SteamIcon />
                {t.authLoginWithSteam}
              </a>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.authUsername}</label>
              <input className={field} placeholder={t.authUsernamePlaceholder} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.authPassword}</label>
              <input className={field} type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border border-white/20 bg-white/5 accent-neon-green cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">{t.rememberMe}</span>
            </label>
            {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50">
              <LogIn className="w-4 h-4" />
              {loading ? t.authLoggingIn : t.authLogin}
            </button>
          </form>

          <div className="text-center">
            <a href="/register" className="text-xs text-muted-foreground hover:text-neon-green transition-colors">{t.authNoAccount}</a>
          </div>
          </>
          )}
        </div>

        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
