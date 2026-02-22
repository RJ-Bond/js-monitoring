"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Ban, Crown, UserX, RefreshCw,
  Newspaper, Server, BarChart2, Users,
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, AlertTriangle, Settings, Eye, EyeOff, ExternalLink, Tag,
  Bell, KeyRound, ClipboardList, Copy, X, MessageSquare, Download, CheckSquare, Square,
  CalendarDays, Mail, UserCheck,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { api, type AdminSiteSettings } from "@/lib/api";
import { toast } from "@/lib/toast";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { APP_VERSION } from "@/lib/version";
import SiteBrand from "@/components/SiteBrand";
import AlertConfigModal from "@/components/AlertConfigModal";
import DiscordConfigModal from "@/components/DiscordConfigModal";
import BulkActionBar from "@/components/BulkActionBar";
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
  registrationEnabled: boolean;
  newsWebhook: string;
  newsRoleId: string;
  onNameChange: (v: string) => void;
  onLogoChange: (v: string) => void;
  onAppUrlChange: (v: string) => void;
  onSteamNewKeyChange: (v: string) => void;
  onSteamClear: () => void;
  onRegistrationEnabledChange: (v: boolean) => void;
  onNewsWebhookChange: (v: string) => void;
  onNewsRoleIdChange: (v: string) => void;
  onTestNewsWebhook: () => void;
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
  saving, saved, registrationEnabled, newsWebhook, newsRoleId, onNameChange, onLogoChange, onAppUrlChange,
  onSteamNewKeyChange, onSteamClear, onRegistrationEnabledChange, onNewsWebhookChange, onNewsRoleIdChange, onTestNewsWebhook, onSave, t,
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

      {/* Registration control */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.adminSettingsRegistration}</h2>
        <button
          type="button"
          onClick={() => onRegistrationEnabledChange(!registrationEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${registrationEnabled ? "bg-neon-green" : "bg-white/20"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${registrationEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <p className="text-xs text-muted-foreground">{t.adminSettingsRegistrationHint}</p>
      </div>

      {/* News Discord Webhook */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.adminSettingsNewsWebhook}</h2>
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={newsWebhook}
            onChange={(e) => onNewsWebhookChange(e.target.value)}
            placeholder={t.adminSettingsNewsWebhookPlaceholder}
          />
          {newsWebhook && (
            <button
              type="button"
              onClick={onTestNewsWebhook}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-neon-blue/10 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/20 transition-all whitespace-nowrap"
            >
              {t.adminSettingsTestWebhook}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t.adminSettingsNewsWebhookHint}</p>
        <input
          className={inputCls}
          value={newsRoleId}
          onChange={(e) => onNewsRoleIdChange(e.target.value)}
          placeholder={t.adminSettingsNewsRoleIdPlaceholder}
        />
        <p className="text-xs text-muted-foreground">{t.adminSettingsNewsRoleIdHint}</p>
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
  const { t, locale } = useLanguage();
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
  const [settingsRegistrationEnabled, setSettingsRegistrationEnabled] = useState(true);
  const [settingsNewsWebhook, setSettingsNewsWebhook] = useState("");
  const [settingsNewsRoleId, setSettingsNewsRoleId] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Servers tab filters
  const [serverSearch, setServerSearch] = useState("");
  const [serverGameFilter, setServerGameFilter] = useState("all");
  const [serverStatusFilter, setServerStatusFilter] = useState<"all" | "online" | "offline">("all");

  // Audit log filter
  const [auditActionFilter, setAuditActionFilter] = useState<"all" | "create" | "update" | "delete">("all");

  // Bulk selections
  const [selectedUserIDs, setSelectedUserIDs] = useState<Set<number>>(new Set());
  const [selectedServerIDs, setSelectedServerIDs] = useState<Set<number>>(new Set());

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

  // Read tab from URL on mount
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab") as AdminTab;
    if (param && ["users", "servers", "stats", "settings", "audit"].includes(param)) {
      setTab(param);
    }
  }, []);

  // Write tab to URL on change
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

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
        setSettingsRegistrationEnabled(s.registration_enabled ?? true);
        setSettingsNewsWebhook(s.news_webhook_url ?? "");
        setSettingsNewsRoleId(s.news_role_id ?? "");
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

  const handleBulkUsers = async (action: string) => {
    const ids = Array.from(selectedUserIDs);
    if (action === "delete" && !confirm(t.bulkConfirmDelete(ids.length))) return;
    try {
      await api.bulkUsers(action, ids);
      setSelectedUserIDs(new Set());
      await fetchUsers();
    } catch { setError("Bulk action failed"); }
  };

  const handleBulkServers = async (action: string) => {
    const ids = Array.from(selectedServerIDs);
    if (!confirm(t.bulkConfirmDelete(ids.length))) return;
    try {
      await api.bulkServers(action, ids);
      setSelectedServerIDs(new Set());
      await fetchServers();
    } catch { setError("Bulk action failed"); }
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

  const filteredServers = useMemo(() => {
    return servers.filter((s) => {
      if (serverSearch) {
        const q = serverSearch.toLowerCase();
        if (
          !(s.title || "").toLowerCase().includes(q) &&
          !s.ip.toLowerCase().includes(q) &&
          !(s.owner_name || "").toLowerCase().includes(q)
        ) return false;
      }
      if (serverGameFilter !== "all" && s.game_type !== serverGameFilter) return false;
      if (serverStatusFilter === "online" && !s.status?.online_status) return false;
      if (serverStatusFilter === "offline" && s.status?.online_status !== false) return false;
      return true;
    });
  }, [servers, serverSearch, serverGameFilter, serverStatusFilter]);

  const filteredAudit = useMemo(() => {
    if (auditActionFilter === "all") return auditLogs;
    return auditLogs.filter((log) => log.action.startsWith(`${auditActionFilter}_`));
  }, [auditLogs, auditActionFilter]);

  // Stats (computed from loaded data)
  const stats = useMemo(() => ({
    totalUsers: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    banned: users.filter((u) => u.banned).length,
    totalServers: servers.length,
    onlineServers: servers.filter((s) => s.status?.online_status).length,
  }), [users, servers]);

  // Registrations by week (last 10 weeks) from users.created_at
  const regByWeek = useMemo(() => {
    const weeks: { label: string; count: number }[] = [];
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const from = now - (i + 1) * 7 * 86400_000;
      const to   = now - i       * 7 * 86400_000;
      const count = users.filter((u) => {
        const ts = new Date(u.created_at).getTime();
        return ts >= from && ts < to;
      }).length;
      const d = new Date(to);
      weeks.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
    }
    return weeks;
  }, [users]);

  // Game type distribution
  const gameTypeDist = useMemo(() => {
    const map: Record<string, number> = {};
    servers.forEach((s) => { map[s.game_type] = (map[s.game_type] ?? 0) + 1; });
    return Object.entries(map)
      .map(([game, count]) => ({ game: GAME_META[game as keyof typeof GAME_META]?.label ?? game, count }))
      .sort((a, b) => b.count - a.count);
  }, [servers]);

  // User detail modal
  const [userDetailUser, setUserDetailUser] = useState<User | null>(null);

  const inputCls = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "users",    label: t.adminTabUsers,    icon: <Users className="w-4 h-4" />,        badge: users.length || undefined },
    { key: "servers",  label: t.adminTabServers,  icon: <Server className="w-4 h-4" />,       badge: servers.length || undefined },
    { key: "stats",    label: t.adminTabStats,    icon: <BarChart2 className="w-4 h-4" /> },
    { key: "settings", label: t.adminTabSettings, icon: <Settings className="w-4 h-4" /> },
    { key: "audit",    label: t.auditLog,         icon: <ClipboardList className="w-4 h-4" />, badge: auditTotal || undefined },
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
                <span className="hidden sm:inline">{tb.label}</span>
                {tb.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-muted-foreground leading-none">
                    {tb.badge}
                  </span>
                )}
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
                        <th className="px-3 py-3 w-8">
                          <button
                            onClick={() => {
                              if (selectedUserIDs.size === filteredUsers.filter(u => u.id !== user?.id).length) {
                                setSelectedUserIDs(new Set());
                              } else {
                                setSelectedUserIDs(new Set(filteredUsers.filter(u => u.id !== user?.id).map(u => u.id)));
                              }
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {selectedUserIDs.size > 0
                              ? <CheckSquare className="w-4 h-4 text-neon-blue" />
                              : <Square className="w-4 h-4" />}
                          </button>
                        </th>
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
                          className={`border-b border-white/5 last:border-0 transition-colors ${u.banned ? "bg-red-400/5" : "hover:bg-white/[0.02]"} ${selectedUserIDs.has(u.id) ? "bg-neon-blue/5" : ""}`}
                        >
                          <td className="px-3 py-3">
                            {u.id !== user?.id && (
                              <button
                                onClick={() => setSelectedUserIDs(prev => {
                                  const next = new Set(prev);
                                  if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                                  return next;
                                })}
                                className="text-muted-foreground hover:text-neon-blue transition-colors"
                              >
                                {selectedUserIDs.has(u.id)
                                  ? <CheckSquare className="w-4 h-4 text-neon-blue" />
                                  : <Square className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => setUserDetailUser(u)}
                              className="flex items-center gap-2 hover:text-neon-blue transition-colors group"
                            >
                              <UserAvatar username={u.username} role={u.role} />
                              <span className="font-medium truncate max-w-[120px] group-hover:underline">{u.username}</span>
                              {u.steam_id && <span title="Steam" className="text-xs">🎮</span>}
                            </button>
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
            <BulkActionBar
              selectedCount={selectedUserIDs.size}
              actions={[
                { label: t.bulkBan,   value: "ban",    danger: true },
                { label: t.bulkUnban, value: "unban" },
                { label: t.bulkDelete, value: "delete", danger: true },
              ]}
              onAction={handleBulkUsers}
              onClear={() => setSelectedUserIDs(new Set())}
            />
          </>
        )}

        {/* ── SERVERS TAB ── */}
        {tab === "servers" && (
          <>
            {/* Search + status filter */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  className={`${inputCls} pl-9 w-full`}
                  placeholder={t.adminSearchPlaceholder}
                  value={serverSearch}
                  onChange={(e) => setServerSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-shrink-0">
                {(["all", "online", "offline"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setServerStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      serverStatusFilter === f ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? t.adminFilterAll : f === "online" ? t.statusOnline : t.statusOffline}
                  </button>
                ))}
              </div>
            </div>

            {/* Game type filter pills */}
            {servers.length > 0 && (() => {
              const gameTypes = Array.from(new Set(servers.map((s) => s.game_type)));
              if (gameTypes.length <= 1) return null;
              return (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  <button
                    onClick={() => setServerGameFilter("all")}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                      serverGameFilter === "all"
                        ? "bg-neon-blue/15 border-neon-blue/40 text-neon-blue"
                        : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                    }`}
                  >
                    {t.adminFilterAll}
                  </button>
                  {gameTypes.map((g) => (
                    <button
                      key={g}
                      onClick={() => setServerGameFilter(serverGameFilter === g ? "all" : g)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                        serverGameFilter === g
                          ? "bg-neon-blue/15 border-neon-blue/40 text-neon-blue"
                          : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                      }`}
                    >
                      {GAME_META[g as keyof typeof GAME_META]?.label ?? g}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Export buttons */}
            <div className="flex items-center gap-2 mb-4 justify-end">
              <a
                href={api.exportServersUrl()}
                download
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {t.exportServers}
              </a>
              <a
                href={api.exportPlayersUrl()}
                download
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                {t.exportPlayers}
              </a>
            </div>

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
                        <th className="px-3 py-3 w-8">
                          <button
                            onClick={() => {
                              const allSelected = filteredServers.every((s) => selectedServerIDs.has(s.id));
                              setSelectedServerIDs((prev) => {
                                const next = new Set(prev);
                                if (allSelected) filteredServers.forEach((s) => next.delete(s.id));
                                else filteredServers.forEach((s) => next.add(s.id));
                                return next;
                              });
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {filteredServers.length > 0 && filteredServers.every((s) => selectedServerIDs.has(s.id))
                              ? <CheckSquare className="w-4 h-4 text-neon-blue" />
                              : <Square className="w-4 h-4" />}
                          </button>
                        </th>
                        <th className="text-left px-5 py-3">{t.adminUsername}</th>
                        <th className="text-left px-5 py-3 hidden sm:table-cell">{t.adminServerGame}</th>
                        <th className="text-left px-5 py-3">{t.adminServerIP}</th>
                        <th className="text-left px-5 py-3 hidden md:table-cell">{t.adminServerOwner}</th>
                        <th className="text-center px-3 py-3 hidden sm:table-cell">{t.cardPlayers}</th>
                        <th className="text-left px-5 py-3">{t.adminStatus}</th>
                        <th className="text-right px-5 py-3">{t.adminActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredServers.map((s) => (
                        <tr key={s.id} className={`border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors ${selectedServerIDs.has(s.id) ? "bg-neon-blue/5" : ""}`}>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => setSelectedServerIDs(prev => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                                return next;
                              })}
                              className="text-muted-foreground hover:text-neon-blue transition-colors"
                            >
                              {selectedServerIDs.has(s.id)
                                ? <CheckSquare className="w-4 h-4 text-neon-blue" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </td>
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
                          <td className="px-3 py-3 text-center hidden sm:table-cell">
                            {s.status?.online_status ? (
                              <span className="text-xs font-mono text-foreground">
                                {s.status.players_now}<span className="text-muted-foreground/50">/{s.status.players_max}</span>
                              </span>
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
                  {filteredServers.length} / {servers.length}
                </div>
              </div>
            )}
            <BulkActionBar
              selectedCount={selectedServerIDs.size}
              actions={[{ label: t.bulkDelete, value: "delete", danger: true }]}
              onAction={handleBulkServers}
              onClear={() => setSelectedServerIDs(new Set())}
            />
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

            {/* Registrations by week */}
            {users.length > 0 && (
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {locale === "ru" ? "Регистрации по неделям" : "Registrations by week"}
                </h2>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={regByWeek} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                        itemStyle={{ color: "#00d4ff" }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#00d4ff" strokeWidth={2} fill="url(#regGrad)" dot={false} name={locale === "ru" ? "Регистрации" : "Registrations"} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Game type distribution */}
            {gameTypeDist.length > 0 && (
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {locale === "ru" ? "Серверы по типу игры" : "Servers by game type"}
                </h2>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gameTypeDist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="game" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                        itemStyle={{ color: "#a855f7" }}
                      />
                      <Bar dataKey="count" fill="#a855f7" fillOpacity={0.8} radius={[4, 4, 0, 0]} name={locale === "ru" ? "Серверов" : "Servers"} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
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
            {/* Action filter + export */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-white/5 rounded-xl p-1">
                {(["all", "create", "update", "delete"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAuditActionFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      auditActionFilter === f ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? t.adminFilterAll : f}
                  </button>
                ))}
              </div>
              <div className="ml-auto">
                <a
                  href={api.exportAuditUrl()}
                  download
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.exportAudit}
                </a>
              </div>
            </div>

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
                      {filteredAudit.map((log) => (
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
                  <span>{filteredAudit.length}{auditActionFilter !== "all" ? ` / ${auditLogs.length}` : ""} / {auditTotal}</span>
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
            registrationEnabled={settingsRegistrationEnabled}
            newsWebhook={settingsNewsWebhook}
            newsRoleId={settingsNewsRoleId}
            onNameChange={setSettingsName}
            onLogoChange={setSettingsLogo}
            onAppUrlChange={setSettingsAppUrl}
            onSteamNewKeyChange={(v) => { setSteamNewKey(v); if (v) setSteamClear(false); }}
            onSteamClear={() => { setSteamClear((prev) => { if (prev) setSteamNewKey(""); return !prev; }); }}
            onRegistrationEnabledChange={setSettingsRegistrationEnabled}
            onNewsWebhookChange={setSettingsNewsWebhook}
            onNewsRoleIdChange={setSettingsNewsRoleId}
            onTestNewsWebhook={async () => {
              try {
                await api.testNewsWebhook();
                toast(t.adminSettingsTestWebhookOk, "success");
              } catch {
                toast(t.adminSettingsTestWebhookFail, "error");
              }
            }}
            onSave={async () => {
              setSettingsSaving(true);
              setSettingsSaved(false);
              try {
                let steamApiKey = "";
                if (steamClear) steamApiKey = "__CLEAR__";
                else if (steamNewKey) steamApiKey = steamNewKey;
                await api.updateSettingsFull({
                  site_name: settingsName,
                  logo_data: settingsLogo,
                  app_url: settingsAppUrl,
                  steam_api_key: steamApiKey,
                  registration_enabled: settingsRegistrationEnabled,
                  news_webhook_url: settingsNewsWebhook,
                  news_role_id: settingsNewsRoleId,
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

      {userDetailUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setUserDetailUser(null); }}
        >
          <div className="w-full max-w-sm glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-neon-blue" />
                <h2 className="font-bold text-sm">{t.adminUsername}</h2>
              </div>
              <button onClick={() => setUserDetailUser(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-5 flex flex-col gap-4">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <UserAvatar username={userDetailUser.username} role={userDetailUser.role} />
                <div>
                  <p className="font-bold text-base">{userDetailUser.username}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${userDetailUser.role === "admin" ? "bg-yellow-400/10 text-yellow-400" : "bg-white/5 text-muted-foreground"}`}>
                    {userDetailUser.role === "admin" ? t.roleAdmin : t.roleUser}
                  </span>
                  {userDetailUser.banned && (
                    <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded-md bg-red-400/10 text-red-400">{t.adminBanned}</span>
                  )}
                </div>
              </div>
              {/* Info rows */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{userDetailUser.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{new Date(userDetailUser.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Server className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{userDetailUser.server_count ?? 0} {t.adminServersCount}</span>
                </div>
                {userDetailUser.steam_id && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">🎮</span>
                    <span className="font-mono text-xs">{userDetailUser.steam_id}</span>
                  </div>
                )}
              </div>
              {/* Quick actions */}
              {userDetailUser.id !== user?.id && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => { handleGenerateResetToken(userDetailUser.id); setUserDetailUser(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-white/10 hover:border-neon-blue/40 text-muted-foreground hover:text-neon-blue transition-all"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> {t.resetPasswordBtn}
                  </button>
                  <button
                    onClick={() => {
                      showConfirm(t.adminConfirmTitle, userDetailUser.banned ? t.adminUnbanConfirm(userDetailUser.username) : t.adminBanConfirm(userDetailUser.username), () => updateUser(userDetailUser.id, { banned: !userDetailUser.banned }));
                      setUserDetailUser(null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition-all ${userDetailUser.banned ? "border-neon-green/30 text-neon-green hover:bg-neon-green/10" : "border-red-400/30 text-red-400 hover:bg-red-400/10"}`}
                  >
                    <Ban className="w-3.5 h-3.5" /> {userDetailUser.banned ? t.adminUnban : t.adminBan}
                  </button>
                  <button
                    onClick={() => {
                      showConfirm(t.adminConfirmTitle, userDetailUser.role === "admin" ? t.adminMakeUserConfirm(userDetailUser.username) : t.adminMakeAdminConfirm(userDetailUser.username), () => updateUser(userDetailUser.id, { role: userDetailUser.role === "admin" ? "user" : "admin" }));
                      setUserDetailUser(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-all"
                  >
                    <Crown className="w-3.5 h-3.5" /> {userDetailUser.role === "admin" ? t.adminMakeUser : t.adminMakeAdmin}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
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
