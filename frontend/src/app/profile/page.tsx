"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Camera, Shield, User2, Mail, CalendarDays, Key,
  Loader2, Check, Code2, Copy, RefreshCw, Trash2,
  Activity, Users, Server, Eye, EyeOff, ExternalLink, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn, gameTypeLabel } from "@/lib/utils";
import { ToastContainer } from "@/components/Toast";
import StatusIndicator from "@/components/StatusIndicator";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SiteBrand from "@/components/SiteBrand";
import type { Server as ServerType } from "@/types/server";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function LetterAvatar({ name, size = "xl" }: { name: string; size?: "sm" | "xl" }) {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  const sz = size === "xl" ? "w-24 h-24 text-4xl" : "w-8 h-8 text-sm";
  return (
    <div className={cn(
      "rounded-full bg-gradient-to-br flex items-center justify-center font-black flex-shrink-0 ring-2 ring-white/10",
      AVATAR_COLORS[idx], sz,
    )}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { user, updateUser, logout, isLoading, isAuthenticated } = useAuth();
  const { t, locale } = useLanguage();

  const fileRef = useRef<HTMLInputElement>(null);

  // Avatar
  const [avatarSrc, setAvatarSrc]         = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Username
  const [username, setUsername]         = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError]   = useState("");

  // Email
  const [email, setEmail]           = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError]   = useState("");

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwError, setPwError]     = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // API token
  const [tokenVisible, setTokenVisible]     = useState(false);
  const [tokenGenerating, setTokenGenerating] = useState(false);

  // My servers
  const [myServers, setMyServers]           = useState<ServerType[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversExpanded, setServersExpanded] = useState(false);

  // Delete account
  const [deleteInput, setDeleteInput]   = useState("");
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
    if (user) {
      setAvatarSrc(user.avatar ?? "");
      setUsername(user.username ?? "");
      setEmail(user.email ?? "");
    }
  }, [user, isLoading, isAuthenticated, router]);

  // Load my servers once
  useEffect(() => {
    if (!isAuthenticated) return;
    setServersLoading(true);
    api.getProfileServers()
      .then(setMyServers)
      .catch(() => {})
      .finally(() => setServersLoading(false));
  }, [isAuthenticated]);

  // ── Avatar handlers ──────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const dataUrl = await resizeImage(file, 256);
      setAvatarPreview(dataUrl);
    } catch {
      toast(t.profileAvatarError);
    }
  };

  const saveAvatarPreview = async () => {
    if (!avatarPreview) return;
    setAvatarUploading(true);
    try {
      const updated = await api.updateAvatar(avatarPreview);
      setAvatarSrc(avatarPreview);
      setAvatarPreview(null);
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
      setAvatarSrc(""); setAvatarPreview(null);
      updateUser(updated);
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Username handler ─────────────────────────────────────────────────────

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

  // ── Email handler ────────────────────────────────────────────────────────

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    const trimmed = email.trim();
    if (trimmed === (user?.email ?? "")) return;
    setEmailSaving(true);
    try {
      const updated = await api.updateProfile({ email: trimmed });
      updateUser(updated);
      setEmail(updated.email ?? "");
      toast(t.profileEmailUpdated);
    } catch {
      setEmailError(t.profileEmailTaken);
    } finally {
      setEmailSaving(false);
    }
  };

  // ── Password handler ─────────────────────────────────────────────────────

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

  // ── API token handler ────────────────────────────────────────────────────

  const handleGenerateToken = async () => {
    setTokenGenerating(true);
    try {
      const updated = await api.generateToken();
      updateUser(updated);
      setTokenVisible(true);
    } finally {
      setTokenGenerating(false);
    }
  };

  const copyToken = () => {
    if (!user?.api_token) return;
    navigator.clipboard.writeText(user.api_token).then(() => toast(t.profileApiTokenCopied));
  };

  // ── Delete account handler ───────────────────────────────────────────────

  const handleDeleteAccount = async () => {
    setDeleteError("");
    if (deleteInput !== user?.username) return;
    setDeleting(true);
    try {
      await api.deleteProfile();
      logout();
      router.replace("/");
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.includes("403")
        ? t.profileDeleteLastAdmin
        : "Error";
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────

  const totalServers = myServers.length;
  const onlineServers = myServers.filter(s => s.status?.online_status).length;
  const totalPlayers = myServers.reduce((sum, s) => sum + (s.status?.players_now ?? 0), 0);

  // ── Render ───────────────────────────────────────────────────────────────

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

  const displayAvatar = avatarPreview ?? avatarSrc;
  const hasToken = !!user.api_token;

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />{t.profileBackToMain}
          </button>
          <div className="flex items-center gap-2">
            <SiteBrand className="hidden sm:flex" />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">{t.profileTitle}</h1>
          {/* Public profile link */}
          <a
            href={`/u/${user.username}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-neon-blue transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {locale === "ru" ? "Публичный профиль" : "Public profile"}
          </a>
        </div>

        {/* ── Avatar + identity ──────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar column */}
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
            <div className="relative group">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={user.username}
                  className={cn(
                    "w-24 h-24 rounded-full object-cover ring-2",
                    avatarPreview ? "ring-neon-green/60" : "ring-white/10",
                  )}
                />
              ) : (
                <LetterAvatar name={user.username} size="xl" />
              )}
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

            {/* Preview actions */}
            {avatarPreview ? (
              <div className="flex gap-2">
                <button
                  onClick={saveAvatarPreview}
                  disabled={avatarUploading}
                  className="text-xs font-semibold text-neon-green hover:text-neon-green/80 disabled:opacity-50 transition-colors"
                >
                  {avatarUploading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t.profileAvatarPreview}
                </button>
                <span className="text-xs text-muted-foreground/40">·</span>
                <button
                  onClick={() => setAvatarPreview(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.profileAvatarCancel}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarUploading}
                  className="text-xs text-neon-green hover:text-neon-green/80 disabled:opacity-50 transition-colors"
                >
                  {t.profileChangeAvatar}
                </button>
                {avatarSrc && (
                  <>
                    <span className="text-xs text-muted-foreground/40">·</span>
                    <button
                      onClick={handleRemoveAvatar}
                      disabled={avatarUploading}
                      className="text-xs text-muted-foreground hover:text-red-400 disabled:opacity-50 transition-colors"
                    >
                      {t.profileRemoveAvatar}
                    </button>
                  </>
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Info column */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* Username */}
            <form onSubmit={handleUsernameSubmit} className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">{t.profileUsername}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setUsernameError(""); }}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-neon-green/40 transition-colors"
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

            {/* Email */}
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">{t.profileEmailChange}</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  placeholder="—"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-neon-green/40 transition-colors"
                />
                <button
                  type="submit"
                  disabled={emailSaving || email.trim() === (user.email ?? "")}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-all disabled:opacity-40 disabled:cursor-default"
                >
                  {emailSaving ? t.profileEmailSaving : t.profileEmailSave}
                </button>
              </div>
              {emailError && <p className="text-xs text-red-400">{emailError}</p>}
            </form>

            {/* Meta chips */}
            <div className="flex flex-wrap gap-2">
              <MetaChip
                icon={<Shield className="w-3 h-3" />}
                value={user.role === "admin" ? t.roleAdmin : t.roleUser}
                highlight={user.role === "admin"}
              />
              {user.steam_id && (
                <MetaChip icon={<User2 className="w-3 h-3" />} value={`Steam: ${user.steam_id.slice(-8)}`} />
              )}
              <MetaChip icon={<CalendarDays className="w-3 h-3" />} value={joinedDate} />
            </div>
          </div>
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <StatMini icon={<Server className="w-4 h-4 text-neon-blue" />} label={t.profileStatServers} value={totalServers} color="text-neon-blue" />
          <StatMini icon={<Activity className="w-4 h-4 text-neon-green" />} label={t.profileStatOnline} value={onlineServers} color="text-neon-green" />
          <StatMini icon={<Users className="w-4 h-4 text-neon-purple" />} label={t.profileStatPlayers} value={totalPlayers} color="text-neon-purple" />
        </div>

        {/* ── My Servers ─────────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <button
            onClick={() => setServersExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-neon-blue" />
              <span className="text-sm font-semibold uppercase tracking-wider">{t.profileMyServers}</span>
              {!serversLoading && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-neon-blue/10 text-neon-blue/80 border border-neon-blue/20">
                  {totalServers}
                </span>
              )}
            </div>
            {serversExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {serversExpanded && (
            <div className="border-t border-white/5 px-5 pb-4">
              {serversLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : myServers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t.profileMyServersEmpty}</p>
              ) : (
                <div className="flex flex-col gap-2 pt-3">
                  {myServers.map(srv => (
                    <div key={srv.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/3 rounded-xl hover:bg-white/5 transition-colors">
                      <StatusIndicator online={srv.status?.online_status ?? false} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{srv.title || srv.status?.server_name || srv.ip}</p>
                        <p className="text-xs text-muted-foreground">{gameTypeLabel(srv.game_type)} · {srv.ip}:{srv.port}</p>
                      </div>
                      {srv.status?.online_status && (
                        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                          {srv.status.players_now}/{srv.status.players_max}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Security ───────────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Key className="w-4 h-4 text-neon-purple" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">{t.profileSecurity}</h2>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-sm">
            <PasswordField label={t.profileCurrentPassword} value={currentPw} onChange={(v) => { setCurrentPw(v); setPwError(""); }} autoComplete="current-password" />
            <PasswordField label={t.profileNewPassword} value={newPw} onChange={(v) => { setNewPw(v); setPwError(""); }} autoComplete="new-password" minLength={6} />
            <PasswordField label={t.profileConfirmPassword} value={confirmPw} onChange={(v) => { setConfirmPw(v); setPwError(""); }} autoComplete="new-password" />
            {pwError   && <p className="text-xs text-red-400">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-neon-green flex items-center gap-1"><Check className="w-3.5 h-3.5" />{t.profilePasswordUpdated}</p>}
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

        {/* ── API Token ──────────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Code2 className="w-4 h-4 text-neon-blue" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">{t.profileApiToken}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">{t.profileApiTokenHint}</p>

          {hasToken ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs overflow-hidden text-muted-foreground">
                  {tokenVisible ? user.api_token : "•".repeat(32)}
                </div>
                <button
                  onClick={() => setTokenVisible(v => !v)}
                  title={tokenVisible ? t.profileApiTokenHide : t.profileApiTokenReveal}
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  {tokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={copyToken}
                  title={t.profileApiTokenCopied}
                  className="p-2 rounded-xl text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateToken}
                  disabled={tokenGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground border border-white/10 hover:border-white/20 hover:text-foreground transition-all disabled:opacity-50"
                >
                  {tokenGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {t.profileApiTokenRegenerate}
                </button>
                <p className="text-xs text-muted-foreground/60">{t.profileApiTokenWarning}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGenerateToken}
              disabled={tokenGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-neon-blue/15 text-neon-blue border border-neon-blue/25 hover:bg-neon-blue/25 transition-all disabled:opacity-50"
            >
              {tokenGenerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {tokenGenerating ? "…" : t.profileApiTokenGenerate}
            </button>
          )}
        </div>

        {/* ── Danger Zone ────────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-6 border border-red-500/15">
          <div className="flex items-center gap-2 mb-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-red-400">{t.profileDangerZone}</h2>
          </div>
          <p className="text-sm font-medium mb-1">{t.profileDeleteAccount}</p>
          <p className="text-xs text-muted-foreground mb-4">{t.profileDeleteAccountHint}</p>

          <div className="flex flex-col gap-3 max-w-sm">
            <p className="text-xs text-muted-foreground">{t.profileDeleteAccountConfirm(user.username)}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => { setDeleteInput(e.target.value); setDeleteError(""); }}
                placeholder={user.username}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400/40 transition-colors"
              />
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteInput !== user.username}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-40 disabled:cursor-default"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? t.profileDeleting : t.profileDeleteAccount}
              </button>
            </div>
            {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
          </div>
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaChip({ icon, value, highlight }: { icon: React.ReactNode; value: string; highlight?: boolean }) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
      highlight
        ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20"
        : "bg-white/5 text-muted-foreground border-white/10",
    )}>
      {icon}{value}
    </span>
  );
}

function StatMini({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-3 flex flex-col items-center gap-1">
      {icon}
      <span className={cn("text-2xl font-black tabular-nums", color)}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">{label}</span>
    </div>
  );
}

function PasswordField({
  label, value, onChange, autoComplete, minLength,
}: { label: string; value: string; onChange: (v: string) => void; autoComplete?: string; minLength?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-neon-purple/40 transition-colors"
      />
    </div>
  );
}
