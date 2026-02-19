"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Ban, Crown, UserX, RefreshCw, Gamepad2,
  Newspaper, Server, BarChart2, Users,
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { User, AdminServer } from "@/types/server";
import { GAME_META } from "@/lib/utils";

type AdminTab = "users" | "servers" | "stats";
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

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();

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

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/");
      return;
    }
    fetchUsers();
  }, [isAuthenticated, isLoading, user, router]);

  // Lazy-load servers when tab is activated
  useEffect(() => {
    if (tab === "servers" && servers.length === 0 && !loadingServers) {
      fetchServers();
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
    { key: "users",   label: t.adminTabUsers,   icon: <Users className="w-4 h-4" /> },
    { key: "servers", label: t.adminTabServers,  icon: <Server className="w-4 h-4" /> },
    { key: "stats",   label: t.adminTabStats,    icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-neon-green/20 border border-neon-green/40 rounded-xl flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-neon-green" />
            </div>
            <span className="font-black text-lg tracking-tight">
              JS<span className="text-neon-green">Monitor</span>
              <span className="ml-2 text-sm font-medium text-muted-foreground">{t.adminPanel}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
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
                            <div className="flex justify-end">
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
          </div>
        )}
      </main>

      {confirmState && (
        <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      )}
    </div>
  );
}
