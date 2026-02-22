"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Ban, Crown, UserX, RefreshCw,
  Newspaper, Server, BarChart2, Users,
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, AlertTriangle, Settings, Eye, EyeOff, ExternalLink, Tag,
  Bell, KeyRound, ClipboardList, Copy, X, MessageSquare,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { api, type AdminSiteSettings } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { APP_VERSION } from "@/lib/version";
import SiteBrand from "@/components/SiteBrand";
import AlertConfigModal from "@/components/AlertConfigModal";
import DiscordConfigModal from "@/components/DiscordConfigModal";
import type { User, AdminServer, AuditLogEntry } from "@/types/server";
import { GAME_META } from "@/lib/utils";

type AdminTab = "users" | "servers" | "stats" | "settings" | "audit";
type SortKey = "username" | "role" | "created_at" | "server_count";
type RoleFilter = "all" | "admin" | "user" | "banned";

interface ConfirmState {
  title: string;
  message: string;
  onConfirm: () => void;
}

// Coloured letter avatar
function UserAvatar({ username, role }: { username: string; role: string }) {
  const cls =
    role === "admin"
      ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/30"
      : "bg-white/10 text-muted-foreground border border-white/10";
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${cls}`}>
      {username[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// Audit action badge color
function getActionColor(action: string): string {
  if (action.startsWith("create_")) return "bg-neon-green/10 text-neon-green";
  if (action.startsWith("delete_")) return "bg-red-400/10 text-red-400";
  if (action.startsWith("update_")) return "bg-neon-blue/10 text-neon-blue";
  return "bg-white/5 text-muted-foreground";
}

// Sort indicator icon
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-neon-green" />
    : <ChevronDown className="w-3 h-3 text-neon-green" />;
}

// Custom confirm modal (replaces browser confirm())
function ConfirmModal({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <h2 className="font-bold text-sm">{state.title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{state.message}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all"
          >
            {t.adminConfirmCancel}
          </button>
          <button
            onClick={() => { state.onConfirm(); onClose(); }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400 transition-all"
          >
            {t.adminConfirmOk}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

interface SettingsTabProps {
  name: string;
  logo: string;
  appUrl: string;
  steamKeySet: boolean;
  steamKeyHint: string;
  steamKeySource: string;
  steamNewKey: string;
  steamClear: boolean;
  saving: boolean;
  saved: boolean;
  onNameChange: (v: string) => void;
  onLogoChange: (v: string) => void;
  onAppUrlChange: (v: string) => void;
  onSteamNewKeyChange: (v: string) => void;
  onSteamClear: () => void;
  onSave: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

function resizeLogo(file: File, maxSize = 64): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, maxSize, maxSize);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/webp", 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("load")); };
    img.src = blobUrl;
  });
}

function SettingsTab({
  name, logo, appUrl, steamKeySet, steamKeyHint, steamKeySource, steamNewKey, steamClear,
  saving, saved, onNameChange, onLogoChange, onAppUrlChange, onSteamNewKeyChange, onSteamClear, onSave, t,
}: SettingsTabProps) {
  const [showKey, setShowKey] = useState(false);
  const inputCls = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground w-full";

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await resizeLogo(file);
      onLogoChange(data);
    } catch {
      // ignore
    }
    e.target.value = "";
  }

  return (
    <div className="max-w-lg space-y-5">
      {/* Site name */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.adminSettingsName}</h2>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={60}
          placeholder="JSMonitor"
        />
        <p className="text-xs text-muted-foreground">{t.adminSettingsNameHint}</p>
      </div>

      {/* Logo */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.adminSettingsLogo}</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-neon-green/20 border border-neon-green/40 flex items-center justify-center flex-shrink-0">
            {logo ? (
              <img src={logo} alt="logo" className="w-7 h-7 object-contain" />
            ) : (
              <Settings className="w-6 h-6 text-neon-green/40" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 text-sm text-muted-foreground hover:text-foreground transition-all w-fit">
              {t.adminSettingsLogoUpload}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
            </label>
            {logo && (
              <button
                onClick={() => onLogoChange("")}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {t.adminSettingsLogoRemove}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t.adminSettingsLogoHint}</p>
      </div>

      {/* Preview */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.adminSettingsPreview}</h2>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/3 border border-white/5">
          <div className="w-6 h-6 rounded-lg bg-neon-green/20 border border-neon-green/40 flex items-center justify-center">
            {logo ? (
              <img src={logo} alt="logo" className="w-3.5 h-3.5 object-contain" />
            ) : (
              <Settings className="w-3.5 h-3.5 text-neon-green" />
            )}
          </div>
          <span className="font-black text-base tracking-tight">{name || "JSMonitor"}</span>
        </div>
      </div>

      {/* App URL */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.adminSettingsSteamTitle}</h2>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{t.adminSettingsAppUrl}</label>
          <input
            className={inputCls}
            value={appUrl}
            onChange={(e) => onAppUrlChange(e.target.value)}
            placeholder="https://yourdomain.com"
          />
          <p className="text-xs text-muted-foreground">{t.adminSettingsAppUrlHint}</p>
        </div>

        {/* Steam API Key */}
        <div className="space-y-2 pt-1 border-t border-white/5">
          <label className="text-xs text-muted-foreground">{t.adminSettingsSteamKey}</label>

          {steamKeySet && !steamClear && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neon-green/5 border border-neon-green/20 text-xs">
              <span className="font-mono text-neon-green/80 flex-1">{steamKeyHint}</span>
              <span className="text-muted-foreground/50">
                {steamKeySource === "env" ? t.adminSettingsSteamFromEnv : t.adminSettingsSteamFromDb}
              </span>
              {steamKeySource === "db" && (
                <button
                  onClick={onSteamClear}
                  className="text-red-400 hover:text-red-300 transition-colors ml-1"
                  title={t.adminSettingsSteamClear}
                >
                  ×
                </button>
              )}
            </div>
          )}

          {steamClear && (
            <div className="px-3 py-2 rounded-xl bg-red-400/10 border border-red-400/20 text-xs text-red-400">
              {t.adminSettingsSteamWillClear}
              <button
                onClick={onSteamClear}
                className="ml-2 underline hover:no-underline"
              >
                {t.btnCancel}
              </button>
            </div>
          )}

          {(!steamKeySet || steamClear) && (
            <div className="relative">
              <input
                className={inputCls}
                type={showKey ? "text" : "password"}
                value={steamNewKey}
                onChange={(e) => onSteamNewKeyChange(e.target.value)}
                placeholder={t.adminSettingsSteamKeyPlaceholder}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}

          {steamKeySet && !steamClear && steamKeySource === "db" && (
            <div className="relative">
              <input
                className={inputCls}
                type={showKey ? "text" : "password"}
                value={steamNewKey}
                onChange={(e) => onSteamNewKeyChange(e.target.value)}
                placeholder={t.adminSettingsSteamKeyChangePlaceholder}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {t.adminSettingsSteamKeyHint}
            <a
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-neon-blue hover:underline"
            >
              {t.adminSettingsSteamKeyLink}
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-background hover:bg-neon-green/90 disabled:opacity-60 transition-all flex items-center gap-2"
      >
        {saving ? t.adminSettingsSaving : saved ? t.adminSettingsSaved : t.adminSettingsSave}
      </button>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const { siteName, logoData, refresh: refreshSettings } = useSiteSettings();

  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingServers, setLoadingServers] = useState(false);
  const [error, setError] = useState("");

  // Users tab state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Confirm modal
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Settings tab state
  const [settingsName, setSettingsName] = useState("");
  const [settingsLogo, setSettingsLogo] = useState("");
  const [settingsAppUrl, setSettingsAppUrl] = useState("");
  const [steamKeySet, setSteamKeySet] = useState(false);
  const [steamKeyHint, setSteamKeyHint] = useState("");
  const [steamKeySource, setSteamKeySource] = useState("db");
  const [steamNewKey, setSteamNewKey] = useState("");
  const [steamClear, setSteamClear] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

  // Alert config modal
  const [alertServerID, setAlertServerID] = useState<number | null>(null);
  const [alertServerName, setAlertServerName] = useState("");

  // Discord config modal
  const [discordServerID, setDiscordServerID] = useState<number | null>(null);
  const [discordServerName, setDiscordServerName] = useState("");

  // Reset link modal
  const [resetLink, setResetLink] = useState("");
  const [resetLinkCopied, setResetLinkCopied] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/");
      return;
    }
    fetchUsers();
  }, [isAuthenticated, isLoading, user, router]);

  // Sync settings state when context updates
  useEffect(() => {
    setSettingsName(siteName);
    setSettingsLogo(logoData);
  }, [siteName, logoData]);

  // Lazy-load servers when tab is activated
  useEffect(() => {
    if (tab === "servers" && servers.length === 0 && !loadingServers) {
      fetchServers();
    }
    if (tab === "audit" && auditLogs.length === 0 && !auditLoading) {
      fetchAuditLog(1);
    }
    if (tab === "settings") {
      api.getAdminSettings().then((s: AdminSiteSettings) => {
        setSteamKeySet(s.steam_key_set);
        setSteamKeyHint(s.steam_key_hint);
        setSteamKeySource(s.steam_key_source);
        setSettingsAppUrl(s.app_url ?? "");
        setSteamNewKey("");
        setSteamClear(false);
      }).catch(() => {});
    }
  }, [tab]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setError("");
    try {
      setUsers(await api.adminGetUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchServers = async () => {
    setLoadingServers(true);
    setError("");
    try {
      setServers(await api.adminGetServers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setLoadingServers(false);
    }
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ title, message, onConfirm });
  };

  const updateUser = async (id: number, data: { role?: string; banned?: boolean }) => {
    try {
      const updated = await api.adminUpdateUser(id, data);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...updated, server_count: u.server_count } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const deleteUser = async (u: User) => {
    try {
      await api.adminDeleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const fetchAuditLog = async (page: number) => {
    setAuditLoading(true);
    try {
      const data = await api.getAuditLog({ page });
      if (page === 1) {
        setAuditLogs(data.items);
      } else {
        setAuditLogs((prev: AuditLogEntry[]) => [...prev, ...data.items]);
      }
      setAuditTotal(data.total);
      setAuditPage(page);
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  };

  const handleGenerateResetToken = async (userId: number) => {
    try {
      const data = await api.generateResetToken(userId);
      setResetLink(data.link);
      setResetLinkCopied(false);
    } catch {
      setError("Failed to generate reset link");
    }
  };

  const deleteServer = async (id: number) => {
    try {
      await api.deleteServer(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      // update user server_count
      const srv = servers.find((s) => s.id === id);
      if (srv?.owner_id) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === srv.owner_id ? { ...u, server_count: Math.max(0, (u.server_count ?? 1) - 1) } : u,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Filtered + sorted users
  const filteredUsers = useMemo(() => {
    let result = users.filter((u) => {
      const q = search.toLowerCase();
      if (q && !u.username.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      if (roleFilter === "admin" && u.role !== "admin") return false;
      if (roleFilter === "user" && (u.role !== "user" || u.banned)) return false;
      if (roleFilter === "banned" && !u.banned) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      const av = sortKey === "server_count" ? (a.server_count ?? 0) : (a[sortKey] ?? "");
      const bv = sortKey === "server_count" ? (b.server_count ?? 0) : (b[sortKey] ?? "");
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).toLowerCase() < String(bv).toLowerCase() ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [users, search, roleFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Stats (computed from loaded data)
  const stats = useMemo(() => ({
    totalUsers: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    banned: users.filter((u) => u.banned).length,
    totalServers: servers.length,
    onlineServers: servers.filter((s) => s.status?.online_status).length,
  }), [users, servers]);

  const inputCls = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: "users",    label: t.adminTabUsers,    icon: <Users className="w-4 h-4" /> },
    { key: "servers",  label: t.adminTabServers,  icon: <Server className="w-4 h-4" /> },
    { key: "stats",    label: t.adminTabStats,    icon: <BarChart2 className="w-4 h-4" /> },
    { key: "settings", label: t.adminTabSettings, icon: <Settings className="w-4 h-4" /> },
    { key: "audit",    label: t.auditLog,         icon: <ClipboardList className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <SiteBrand
              size="lg"
              suffix={<span className="ml-2 text-sm font-medium text-muted-foreground">{t.adminPanel}</span>}
            />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            <button
              onClick={() => { fetchUsers(); if (tab === "servers") fetchServers(); }}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <a
              href="/admin/news"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-blue-400/20 hover:border-blue-400/40 text-blue-400 hover:text-blue-300 transition-all"
            >
              <Newspaper className="w-3.5 h-3.5" />
              {t.newsAdminLink}
            </a>
            <a
              href="/"
              className="px-3 py-2 rounded-xl text-xs font-medium border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all"
            >
              {t.adminBackToPanel}
            </a>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
                  tab === tb.key
                    ? "border-neon-green text-neon-green"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tb.icon}
                {tb.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <>
            {/* Search + filters */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  className={`${inputCls} pl-9 w-full`}
                  placeholder={t.adminSearchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-shrink-0">
                {(["all", "admin", "user", "banned"] as RoleFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRoleFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      roleFilter === f ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? t.adminFilterAll
                      : f === "admin" ? t.adminFilterAdmins
                      : f === "user" ? t.adminFilterUsers
                      : t.adminFilterBanned}
                  </button>
                ))}
              </div>
            </div>

            {loadingUsers ? (
              <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">{t.adminNoUsers}</div>
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left px-5 py-3">
                          <button
                            onClick={() => toggleSort("username")}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {t.adminUsername}
                            <SortIcon active={sortKey === "username"} dir={sortDir} />
                          </button>
                        </th>
                        <th className="text-left px-5 py-3 hidden sm:table-cell">{t.adminEmail}</th>
                        <th className="text-left px-5 py-3">
                          <button
                            onClick={() => toggleSort("role")}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {t.adminRole}
                            <SortIcon active={sortKey === "role"} dir={sortDir} />
                          </button>
                        </th>
                        <th className="text-left px-5 py-3">{t.adminStatus}</th>
                        <th className="text-left px-5 py-3 hidden md:table-cell">
                          <button
                            onClick={() => toggleSort("server_count")}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {t.adminTabServers}
                            <SortIcon active={sortKey === "server_count"} dir={sortDir} />
                          </button>
                        </th>
                        <th className="text-left px-5 py-3 hidden lg:table-cell">
                          <button
                            onClick={() => toggleSort("created_at")}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {t.adminCreated}
                            <SortIcon active={sortKey === "created_at"} dir={sortDir} />
                          </button>
                        </th>
                        <th className="text-right px-5 py-3">{t.adminActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          className={`border-b border-white/5 last:border-0 transition-colors ${u.banned ? "bg-red-400/5" : "hover:bg-white/[0.02]"}`}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <UserAvatar username={u.username} role={u.role} />
                              <span className="font-medium truncate max-w-[120px]">{u.username}</span>
                              {u.steam_id && <span title="Steam" className="text-xs">🎮</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[180px]">
                            {u.email || "—"}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${u.role === "admin" ? "bg-yellow-400/10 text-yellow-400" : "bg-white/5 text-muted-foreground"}`}>
                              {u.role === "admin" ? t.roleAdmin : t.roleUser}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${u.banned ? "bg-red-400/10 text-red-400" : "bg-neon-green/10 text-neon-green"}`}>
                              {u.banned ? t.adminBanned : t.adminActive}
                            </span>
                          </td>
                          <td className="px-5 py-3 hidden md:table-cell">
                            {(u.server_count ?? 0) > 0 ? (
                              <span className="text-xs bg-white/5 px-2 py-0.5 rounded-md text-muted-foreground">
                                {u.server_count} {t.adminServersCount}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3">
                            {u.id !== user?.id && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleGenerateResetToken(u.id)}
                                  title={t.resetPasswordBtn}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    showConfirm(
                                      t.adminConfirmTitle,
                                      u.banned ? t.adminUnbanConfirm(u.username) : t.adminBanConfirm(u.username),
                                      () => updateUser(u.id, { banned: !u.banned }),
                                    )
                                  }
                                  title={u.banned ? t.adminUnban : t.adminBan}
                                  className={`p-1.5 rounded-lg transition-colors ${u.banned ? "text-neon-green hover:bg-neon-green/10" : "text-red-400 hover:bg-red-400/10"}`}
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    showConfirm(
                                      t.adminConfirmTitle,
                                      u.role === "admin"
                                        ? t.adminMakeUserConfirm(u.username)
                                        : t.adminMakeAdminConfirm(u.username),
                                      () => updateUser(u.id, { role: u.role === "admin" ? "user" : "admin" }),
                                    )
                                  }
                                  title={u.role === "admin" ? t.adminMakeUser : t.adminMakeAdmin}
                                  className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                                >
                                  <Crown className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    showConfirm(
                                      t.adminConfirmTitle,
                                      t.adminDeleteConfirm(u.username),
                                      () => deleteUser(u),
                                    )
                                  }
                                  title={t.adminDelete}
                                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-2 border-t border-white/5 text-xs text-muted-foreground">
                  {filteredUsers.length} / {users.length}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SERVERS TAB ── */}
        {tab === "servers" && (
          <>
            {loadingServers ? (
              <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
            ) : servers.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">{t.adminNoServers}</div>
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left px-5 py-3">{t.adminUsername}</th>
                        <th className="text-left px-5 py-3 hidden sm:table-cell">{t.adminServerGame}</th>
                        <th className="text-left px-5 py-3">{t.adminServerIP}</th>
                        <th className="text-left px-5 py-3 hidden md:table-cell">{t.adminServerOwner}</th>
                        <th className="text-left px-5 py-3">{t.adminStatus}</th>
                        <th className="text-right px-5 py-3">{t.adminActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map((s) => (
                        <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3">
                            <span className="font-medium truncate max-w-[160px] block">
                              {s.title || s.status?.server_name || s.ip}
                            </span>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                            {GAME_META[s.game_type]?.label ?? s.game_type}
                          </td>
                          <td className="px-5 py-3 text-xs text-muted-foreground font-mono">
                            {s.display_ip || s.ip}:{s.port}
                          </td>
                          <td className="px-5 py-3 hidden md:table-cell">
                            {s.owner_name ? (
                              <span className="text-xs text-muted-foreground">{s.owner_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${s.status?.online_status ? "bg-neon-green/10 text-neon-green" : "bg-red-400/10 text-red-400"}`}>
                              {s.status?.online_status ? t.statusOnline : t.statusOffline}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => { setDiscordServerID(s.id); setDiscordServerName(s.title || s.ip); }}
                                title={t.discordTitle}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => { setAlertServerID(s.id); setAlertServerName(s.title || s.ip); }}
                                title={t.alertsTitle}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                              >
                                <Bell className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() =>
                                  showConfirm(
                                    t.adminConfirmTitle,
                                    t.deleteModalDesc(s.title || s.ip),
                                    () => deleteServer(s.id),
                                  )
                                }
                                title={t.adminDelete}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-2 border-t border-white/5 text-xs text-muted-foreground">
                  {servers.length}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── STATS TAB ── */}
        {tab === "stats" && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: t.adminStatsTotalUsers,   value: stats.totalUsers,   color: "text-neon-blue",   bg: "bg-neon-blue/10",   icon: <Users className="w-5 h-5 text-neon-blue" /> },
                { label: t.adminStatsAdmins,        value: stats.admins,       color: "text-yellow-400",  bg: "bg-yellow-400/10",  icon: <Crown className="w-5 h-5 text-yellow-400" /> },
                { label: t.adminStatsBanned,        value: stats.banned,       color: "text-red-400",     bg: "bg-red-400/10",     icon: <Ban className="w-5 h-5 text-red-400" /> },
                { label: t.adminStatsTotalServers,  value: stats.totalServers, color: "text-neon-purple", bg: "bg-neon-purple/10", icon: <Server className="w-5 h-5 text-neon-purple" /> },
                { label: t.adminStatsOnline,        value: stats.onlineServers,color: "text-neon-green",  bg: "bg-neon-green/10",  icon: <Shield className="w-5 h-5 text-neon-green" /> },
              ].map((card) => (
                <div key={card.label} className="glass-card rounded-2xl px-5 py-4 flex flex-col gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.bg}`}>
                    {card.icon}
                  </div>
                  <div className="text-2xl font-black tabular-nums">{card.value}</div>
                  <div className="text-xs text-muted-foreground leading-tight">{card.label}</div>
                </div>
              ))}
            </div>

            {stats.totalServers === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {t.adminNoServers} — <button onClick={() => { setTab("servers"); fetchServers(); }} className="underline hover:text-foreground">{t.adminTabServers}</button>
              </p>
            )}

            {/* Version card */}
            <div className="glass-card rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5">
                  <Tag className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-bold font-mono">{APP_VERSION}</div>
                  <div className="text-xs text-muted-foreground">{t.adminStatsVersion}</div>
                </div>
              </div>
              <a
                href="https://github.com/RJ-Bond/js-monitoring/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-xl transition-all"
              >
                {t.adminStatsCheckUpdates}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* ── AUDIT TAB ── */}
        {tab === "audit" && (
          <div className="flex flex-col gap-4">
            {auditLoading && auditLogs.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">{t.auditEmpty}</div>
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left px-5 py-3">{t.auditAction}</th>
                        <th className="text-left px-5 py-3 hidden sm:table-cell">{t.auditActor}</th>
                        <th className="text-left px-5 py-3 hidden md:table-cell">{t.auditEntity}</th>
                        <th className="text-left px-5 py-3 hidden lg:table-cell">{t.auditDetails}</th>
                        <th className="text-right px-5 py-3">{t.adminCreated}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${getActionColor(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                            {log.actor_name || `#${log.actor_id}`}
                          </td>
                          <td className="px-5 py-3 hidden md:table-cell text-xs text-muted-foreground">
                            {log.entity_type} #{log.entity_id}
                          </td>
                          <td className="px-5 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.details}
                          </td>
                          <td className="px-5 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{auditLogs.length} / {auditTotal}</span>
                  {auditLogs.length < auditTotal && (
                    <button
                      onClick={() => fetchAuditLog(auditPage + 1)}
                      disabled={auditLoading}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:text-foreground transition-all disabled:opacity-50"
                    >
                      {auditLoading ? "…" : t.auditLoadMore}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <SettingsTab
            name={settingsName}
            logo={settingsLogo}
            appUrl={settingsAppUrl}
            steamKeySet={steamKeySet}
            steamKeyHint={steamKeyHint}
            steamKeySource={steamKeySource}
            steamNewKey={steamNewKey}
            steamClear={steamClear}
            saving={settingsSaving}
            saved={settingsSaved}
            onNameChange={setSettingsName}
            onLogoChange={setSettingsLogo}
            onAppUrlChange={setSettingsAppUrl}
            onSteamNewKeyChange={(v) => { setSteamNewKey(v); if (v) setSteamClear(false); }}
            onSteamClear={() => { setSteamClear((prev) => { if (prev) setSteamNewKey(""); return !prev; }); }}
            onSave={async () => {
              setSettingsSaving(true);
              setSettingsSaved(false);
              try {
                let steamApiKey = "";
                if (steamClear) steamApiKey = "__CLEAR__";
                else if (steamNewKey) steamApiKey = steamNewKey;
                await api.updateSettings({
                  site_name: settingsName,
                  logo_data: settingsLogo,
                  app_url: settingsAppUrl,
                  steam_api_key: steamApiKey,
                });
                await refreshSettings();
                // Refresh Steam key info
                const updated = await api.getAdminSettings();
                setSteamKeySet(updated.steam_key_set);
                setSteamKeyHint(updated.steam_key_hint);
                setSteamKeySource(updated.steam_key_source);
                setSteamNewKey("");
                setSteamClear(false);
                setSettingsSaved(true);
                setTimeout(() => setSettingsSaved(false), 2000);
              } catch {
                setError(t.adminSettingsSaveError);
              } finally {
                setSettingsSaving(false);
              }
            }}
            t={t}
          />
        )}
      </main>

      {confirmState && (
        <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      )}

      {alertServerID !== null && (
        <AlertConfigModal
          serverID={alertServerID}
          serverName={alertServerName}
          onClose={() => { setAlertServerID(null); setAlertServerName(""); }}
        />
      )}

      {discordServerID !== null && (
        <DiscordConfigModal
          serverID={discordServerID}
          serverName={discordServerName}
          onClose={() => { setDiscordServerID(null); setDiscordServerName(""); }}
        />
      )}

      {resetLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setResetLink(""); }}
        >
          <div className="w-full max-w-md glass-card rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-neon-blue" />
                <h2 className="font-bold text-sm">{t.resetPasswordBtn}</h2>
              </div>
              <button
                onClick={() => setResetLink("")}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{t.resetPasswordBtn}</p>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                <span className="flex-1 text-xs font-mono text-foreground break-all">{resetLink}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetLink);
                  setResetLinkCopied(true);
                  setTimeout(() => setResetLinkCopied(false), 2000);
                }}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                  resetLinkCopied
                    ? "bg-neon-green/20 text-neon-green border-neon-green/30"
                    : "bg-neon-blue/20 text-neon-blue border-neon-blue/30 hover:bg-neon-blue/30"
                }`}
              >
                <Copy className="w-4 h-4" />
                {resetLinkCopied ? t.resetPasswordSuccess : t.resetPasswordBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
