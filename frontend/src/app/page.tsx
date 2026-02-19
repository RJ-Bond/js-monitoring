"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Plus, RefreshCw, Gamepad2, Zap, LogOut, User, Shield, Newspaper,
  CalendarDays, Menu, X, Download, ChevronUp, ChevronDown,
} from "lucide-react";
import { useServers, useDeleteServer } from "@/hooks/useServers";
import { useServerWebSocket } from "@/hooks/useWebSocket";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites } from "@/hooks/useFavorites";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { renderMarkdown } from "@/lib/markdown";
import { useQuery } from "@tanstack/react-query";
import ServerCard from "@/components/ServerCard";
import StatsOverview from "@/components/StatsOverview";
import AddEditServerModal from "@/components/AddEditServerModal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GameIcon from "@/components/GameIcon";
import { ToastContainer } from "@/components/Toast";
import type { GameType, Server, NewsItem } from "@/types/server";
import { GAME_META } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type SortMode = "default" | "players" | "ping" | "name" | "status";

const NEWS_PREVIEW = 3;

export default function Home() {
  useServerWebSocket();
  const { t } = useLanguage();
  const { user, logout, isAuthenticated } = useAuth();
  const { data: servers, isLoading, refetch, isRefetching } = useServers();
  const { mutate: deleteServer } = useDeleteServer();
  const qc = useQueryClient();
  const { favorites, toggle: toggleFavorite } = useFavorites();

  const [modalServer, setModalServer] = useState<Server | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [gameFilter, setGameFilter] = useState<GameType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [newsModal, setNewsModal] = useState<NewsItem | null>(null);
  const [showAllNews, setShowAllNews] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: news } = useQuery<NewsItem[]>({
    queryKey: ["news"],
    queryFn: api.getNews,
    staleTime: 60_000,
  });

  // Keyboard shortcuts: R = refresh, N = new server
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "r" || e.key === "R") { refetch(); toast(t.toastRefreshed); }
      if (e.key === "n" || e.key === "N") setModalServer("new");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refetch, t]);

  // Filter
  const filtered = useMemo(() => (servers ?? []).filter((srv) => {
    if (gameFilter !== "all" && srv.game_type !== gameFilter) return false;
    if (statusFilter === "online" && !srv.status?.online_status) return false;
    if (statusFilter === "offline" && srv.status?.online_status !== false) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(srv.title || "").toLowerCase().includes(q) &&
        !srv.ip.toLowerCase().includes(q) &&
        !(srv.status?.server_name || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [servers, gameFilter, statusFilter, search]);

  // Sort + favorites-first
  const sorted = useMemo(() => {
    const sortFn = (arr: Server[]) => {
      const a = [...arr];
      if (sortMode === "name") a.sort((x, y) => (x.title || x.ip).localeCompare(y.title || y.ip));
      else if (sortMode === "players") a.sort((x, y) => (y.status?.players_now ?? 0) - (x.status?.players_now ?? 0));
      else if (sortMode === "ping") a.sort((x, y) => {
        if (!x.status?.online_status) return 1;
        if (!y.status?.online_status) return -1;
        return (x.status.ping_ms ?? 9999) - (y.status.ping_ms ?? 9999);
      });
      else if (sortMode === "status") a.sort((x, y) =>
        (y.status?.online_status ? 1 : 0) - (x.status?.online_status ? 1 : 0)
      );
      return a;
    };
    const favs = filtered.filter((s) => favorites.includes(s.id));
    const rest = filtered.filter((s) => !favorites.includes(s.id));
    return [...sortFn(favs), ...sortFn(rest)];
  }, [filtered, sortMode, favorites]);

  const onlineCount = (servers ?? []).filter((s) => s.status?.online_status).length;

  const handleUpdate = async (id: number, data: Partial<Server>) => {
    await api.updateServer(id, data);
    qc.invalidateQueries({ queryKey: ["servers"] });
  };

  const exportJSON = () => {
    const data = (servers ?? []).map((s) => ({
      title: s.title || s.status?.server_name || s.ip,
      ip: s.ip,
      display_ip: s.display_ip,
      port: s.port,
      game_type: s.game_type,
      status: s.status?.online_status ? "online" : "offline",
      players: s.status ? `${s.status.players_now}/${s.status.players_max}` : "—",
      ping_ms: s.status?.ping_ms,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jsmonitor-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: "default", label: t.sortDefault },
    { key: "status",  label: t.sortStatus },
    { key: "players", label: t.sortPlayers },
    { key: "ping",    label: t.sortPing },
    { key: "name",    label: t.sortName },
  ];

  const visibleNews = showAllNews ? (news ?? []) : (news ?? []).slice(0, NEWS_PREVIEW);

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 bg-neon-green/20 border border-neon-green/40 rounded-xl flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-neon-green" />
            </div>
            <span className="font-black text-lg tracking-tight">JS<span className="text-neon-green">Monitor</span></span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            <span className="text-xs text-muted-foreground">{t.onlineCount(onlineCount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {isAuthenticated && user && (
              <>
                <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground px-2">
                  <User className="w-3.5 h-3.5" />{user.username}
                </span>
                <button onClick={logout} title="Logout" className="hidden sm:flex p-2 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
            {isAuthenticated && user?.role === "admin" && (
              <>
                <a href="/admin/news" className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border border-blue-400/20 hover:border-blue-400/40 text-blue-400 hover:text-blue-300 transition-all">
                  <Newspaper className="w-3.5 h-3.5" />
                  {t.newsAdminLink}
                </a>
                <a href="/admin" className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border border-yellow-400/20 hover:border-yellow-400/40 text-yellow-400 hover:text-yellow-300 transition-all">
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </a>
              </>
            )}
            {!isAuthenticated && (
              <a href="/login" className="hidden sm:flex px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all">
                {t.authLogin}
              </a>
            )}
            <button onClick={() => refetch()} disabled={isRefetching} title="R" className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setModalServer("new")} title="N" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t.addServer}</span>
            </button>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="sm:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-white/5 px-4 py-3 flex flex-col gap-1 bg-background/95">
            {isAuthenticated && user && (
              <div className="flex items-center gap-2 px-2 py-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{user.username}</span>
              </div>
            )}
            {isAuthenticated && user?.role === "admin" && (
              <>
                <a href="/admin/news" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-blue-400 hover:bg-blue-400/10 transition-colors">
                  <Newspaper className="w-4 h-4" />{t.newsAdminLink}
                </a>
                <a href="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                  <Shield className="w-4 h-4" />Admin
                </a>
              </>
            )}
            {isAuthenticated ? (
              <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors text-left">
                <LogOut className="w-4 h-4" />Logout
              </button>
            ) : (
              <a href="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                {t.authLogin}
              </a>
            )}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* News */}
        {news && news.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-neon-blue" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t.newsTitle}</h2>
              </div>
              {news.length > NEWS_PREVIEW && (
                <button
                  onClick={() => setShowAllNews((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAllNews
                    ? <><ChevronUp className="w-3.5 h-3.5" />{t.newsShowLess}</>
                    : <><ChevronDown className="w-3.5 h-3.5" />{t.newsShowAll(news.length)}</>
                  }
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleNews.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setNewsModal(item)}
                  className="glass-card rounded-2xl p-4 flex flex-col gap-2 border-l-2 border-neon-blue/40 cursor-pointer hover:border-neon-blue/70 hover:bg-white/[0.03] transition-all"
                >
                  <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                    {item.content.replace(/#{1,6} /g, "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/\[(.+?)\]\(.+?\)/g, "$1").replace(/^- /gm, "• ")}
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="w-3 h-3" />
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    {item.author_name && (
                      <span className="text-xs text-muted-foreground/60 ml-auto">{t.newsBy} {item.author_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <StatsOverview />

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-neon-green/40 transition-all placeholder:text-muted-foreground" />
          </div>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-shrink-0">
            {(["all", "online", "offline"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? t.filterAll : s === "online" ? t.filterOnline : t.filterOffline}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto flex-shrink-0">
            <button onClick={() => setGameFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${gameFilter === "all" ? "bg-neon-green/20 text-neon-green border border-neon-green/30" : "text-muted-foreground hover:text-foreground"}`}>🎮</button>
            {(Object.keys(GAME_META) as GameType[]).map((gt) => (
              <button key={gt} onClick={() => setGameFilter(gt)} title={GAME_META[gt].label} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${gameFilter === gt ? "bg-neon-green/20 text-neon-green border border-neon-green/30" : "text-muted-foreground hover:text-foreground"}`}>
                <GameIcon gameType={gt} imgClassName="h-4 w-auto max-w-[2.5rem] object-contain rounded-sm" emojiClassName="text-sm leading-none" />
              </button>
            ))}
          </div>
        </div>

        {/* Sort bar + export */}
        <div className="flex items-center justify-between gap-3 -mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">{t.sortBy}</span>
            <div className="flex gap-1 bg-white/5 rounded-xl p-1">
              {sortOptions.map((s) => (
                <button key={s.key} onClick={() => setSortMode(s.key)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${sortMode === s.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={exportJSON} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.exportJson}</span>
          </button>
        </div>

        {/* Server grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass-card rounded-2xl h-56 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center"><Zap className="w-8 h-8 text-muted-foreground" /></div>
            <div>
              <p className="font-semibold">{t.noServersFound}</p>
              <p className="text-sm text-muted-foreground mt-1">{(servers ?? []).length === 0 ? t.noServersHint : t.noServersFilter}</p>
            </div>
            {(servers ?? []).length === 0 && (
              <button onClick={() => setModalServer("new")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all">
                <Plus className="w-4 h-4" />{t.btnAddFirst}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((srv) => {
              const canManage = user?.role === "admin" || user?.id === srv.owner_id;
              return (
                <ServerCard
                  key={srv.id}
                  server={srv}
                  isFavorite={favorites.includes(srv.id)}
                  onToggleFavorite={() => toggleFavorite(srv.id)}
                  onEdit={canManage ? (s) => setModalServer(s) : undefined}
                  onDelete={canManage ? () => setDeleteTarget(srv) : undefined}
                />
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>JSMonitor © {new Date().getFullYear()}</span>
          <span className="hidden sm:block opacity-40">R — refresh · N — add</span>
          <span>{t.footerBuiltWith} <span className="text-neon-green">Go</span> + <span className="text-neon-blue">Next.js</span></span>
        </div>
      </footer>

      {/* News article modal */}
      {newsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setNewsModal(null); }}
        >
          <div className="w-full max-w-2xl glass-card rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/10">
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg leading-snug">{newsModal.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{new Date(newsModal.created_at).toLocaleDateString()}</span>
                  {newsModal.author_name && <span>{t.newsBy} {newsModal.author_name}</span>}
                </div>
              </div>
              <button onClick={() => setNewsModal(null)} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className="px-6 py-5 overflow-y-auto text-sm text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(newsModal.content) }}
            />
          </div>
        </div>
      )}

      {modalServer && (
        <AddEditServerModal
          onClose={() => setModalServer(null)}
          editServer={modalServer === "new" ? undefined : modalServer}
          onUpdate={modalServer !== "new" ? (data) => handleUpdate((modalServer as Server).id, data) : undefined}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          server={deleteTarget}
          onConfirm={() => { deleteServer(deleteTarget.id); toast(t.toastServerDeleted); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
