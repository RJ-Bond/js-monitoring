"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Camera, Shield, User2, Mail, CalendarDays, Key,
  Loader2, Check, Gamepad2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ToastContainer } from "@/components/Toast";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Resize an image File to maxSize×maxSize WebP and return a data URL
function resizeImage(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("load failed")); };
    img.src = blobUrl;
  });
}

const AVATAR_COLORS = [
  "from-neon-green/30 to-neon-blue/30 text-neon-green",
  "from-neon-blue/30 to-neon-purple/30 text-neon-blue",
  "from-neon-purple/30 to-yellow-400/20 text-neon-purple",
  "from-yellow-400/30 to-neon-green/20 text-yellow-400",
];

function LetterAvatar({ name, size = "lg" }: { name: string; size?: "lg" | "xl" }) {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  const sz = size === "xl" ? "w-24 h-24 text-4xl" : "w-16 h-16 text-2xl";
  return (
    <div className={cn(
      "rounded-full bg-gradient-to-br flex items-center justify-center font-black flex-shrink-0 ring-2 ring-white/10",
      AVATAR_COLORS[idx], sz,
    )}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, updateUser, isLoading, isAuthenticated } = useAuth();
  const { t, locale } = useLanguage();

  const fileRef = useRef<HTMLInputElement>(null);

  // Avatar
  const [avatarSrc, setAvatarSrc] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Username form
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
    if (user) {
      setAvatarSrc(user.avatar ?? "");
      setUsername(user.username ?? "");
    }
  }, [user, isLoading, isAuthenticated, router]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeImage(file, 256);
      setAvatarSrc(dataUrl);
      const updated = await api.updateAvatar(dataUrl);
      updateUser(updated);
      toast(t.profileAvatarSaved);
    } catch {
      toast(t.profileAvatarError);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try {
      const updated = await api.updateAvatar("");
      setAvatarSrc("");
      updateUser(updated);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError("");
    const trimmed = username.trim();
    if (!trimmed || trimmed === user?.username) return;
    setUsernameSaving(true);
    try {
      const updated = await api.updateProfile({ username: trimmed });
      updateUser(updated);
      setUsername(updated.username);
      toast(t.profileUsernameUpdated);
    } catch {
      setUsernameError(t.profileUsernameTaken);
    } finally {
      setUsernameSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError(t.authPasswordMismatch); return; }
    if (newPw.length < 6) { setPwError(t.setupTooShort); return; }
    setPwSaving(true);
    try {
      await api.updateProfile({ current_password: currentPw, new_password: newPw });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwSuccess(true);
      toast(t.profilePasswordUpdated);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError(t.profilePasswordWrong);
    } finally {
      setPwSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return null;

  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "—";

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.profileBackToMain}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-neon-green/20 border border-neon-green/40 rounded-lg flex items-center justify-center">
                <Gamepad2 className="w-3.5 h-3.5 text-neon-green" />
              </div>
              <span className="font-black text-base tracking-tight hidden sm:block">
                JS<span className="text-neon-green">Monitor</span>
              </span>
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h1 className="text-2xl font-black">{t.profileTitle}</h1>

        {/* ── Avatar + identity card ───────────────────── */}
        <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
            <div className="relative group">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user.username}
                  className="w-24 h-24 rounded-full object-cover ring-2 ring-white/10"
                />
              ) : (
                <LetterAvatar name={user.username} size="xl" />
              )}
              {/* Overlay on hover */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {avatarUploading
                  ? <Loader2 className="w-6 h-6 animate-spin text-white" />
                  : <Camera className="w-6 h-6 text-white" />
                }
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="text-xs text-neon-green hover:text-neon-green/80 transition-colors disabled:opacity-50"
              >
                {t.profileChangeAvatar}
              </button>
              {avatarSrc && (
                <>
                  <span className="text-xs text-muted-foreground/40">·</span>
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={avatarUploading}
                    className="text-xs text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {t.profileRemoveAvatar}
                  </button>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* Username form */}
            <form onSubmit={handleUsernameSubmit} className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">{t.profileUsername}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setUsernameError(""); }}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-neon-green/40 focus:bg-white/8 transition-colors"
                  maxLength={50}
                />
                <button
                  type="submit"
                  disabled={usernameSaving || !username.trim() || username.trim() === user.username}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-all disabled:opacity-40 disabled:cursor-default"
                >
                  {usernameSaving ? t.profileSavingUsername : t.profileSaveUsername}
                </button>
              </div>
              {usernameError && <p className="text-xs text-red-400">{usernameError}</p>}
            </form>

            {/* Account info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label={t.profileEmail} value={user.email || t.profileNoEmail} />
              <InfoRow icon={<Shield className="w-3.5 h-3.5" />} label={t.profileRole} value={user.role === "admin" ? t.roleAdmin : t.roleUser} highlight={user.role === "admin"} />
              {user.steam_id && (
                <InfoRow icon={<User2 className="w-3.5 h-3.5" />} label={t.profileSteamId} value={user.steam_id} />
              )}
              <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label={t.profileJoined} value={joinedDate} />
            </div>
          </div>
        </div>

        {/* ── Password change card ─────────────────────── */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Key className="w-4 h-4 text-neon-purple" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">{t.profileSecurity}</h2>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-sm">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">{t.profileCurrentPassword}</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => { setCurrentPw(e.target.value); setPwError(""); }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-neon-purple/40 focus:bg-white/8 transition-colors"
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">{t.profileNewPassword}</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setPwError(""); }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-neon-purple/40 focus:bg-white/8 transition-colors"
                autoComplete="new-password"
                minLength={6}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">{t.profileConfirmPassword}</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setPwError(""); }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-neon-purple/40 focus:bg-white/8 transition-colors"
                autoComplete="new-password"
              />
            </div>
            {pwError && <p className="text-xs text-red-400">{pwError}</p>}
            {pwSuccess && (
              <p className="text-xs text-neon-green flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />{t.profilePasswordUpdated}
              </p>
            )}
            <button
              type="submit"
              disabled={pwSaving || !currentPw || !newPw || !confirmPw}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-neon-purple/20 text-neon-purple border border-neon-purple/30 hover:bg-neon-purple/30 transition-all disabled:opacity-40 disabled:cursor-default"
            >
              {pwSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {pwSaving ? t.profileSavingPassword : t.profileSavePassword}
            </button>
          </form>
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}

function InfoRow({
  icon, label, value, highlight,
}: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-white/5 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <span className={cn("text-sm font-medium truncate", highlight ? "text-yellow-400" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
