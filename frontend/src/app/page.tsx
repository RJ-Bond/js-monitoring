"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, RefreshCw, Zap, LogOut, User, Shield, Newspaper,
  CalendarDays, Menu, X, Download, ArrowUpRight, Clock, Pencil,
  Eye, Search, Pin, Rss, GitCompare, Link2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useServers, useDeleteServer } from "@/hooks/useServers";
import { useServerWebSocket } from "@/hooks/useWebSocket";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { useFavorites } from "@/hooks/useFavorites";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { renderMarkdown, renderMarkdownPreview, stripMarkdown } from "@/lib/markdown";
import ServerCard from "@/components/ServerCard";
import ServerCardSkeleton from "@/components/ServerCardSkeleton";
import CommandPalette from "@/components/CommandPalette";
import StatsOverview from "@/components/StatsOverview";
import AddEditServerModal from "@/components/AddEditServerModal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import GameIcon from "@/components/GameIcon";
import SiteBrand from "@/components/SiteBrand";
import { ToastContainer } from "@/components/Toast";
import type { GameType, Server, NewsItem } from "@/types/server";
import { parseTags } from "@/types/server";
import { GAME_META } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { useQueryClient } from "@tanstack/react-query";

type SortMode = "default" | "players" | "ping" | "name" | "status";

function relativeTime(dateStr: string, locale: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 2) return locale === "ru" ? "только что" : "just now";
  if (m < 60) return locale === "ru" ? `${m} мин. назад` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "ru" ? `${h} ч. назад` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return locale === "ru" ? `${d} дн. назад` : `${d}d ago`;
  return new Date(dateStr).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
}

function AuthorAvatar({ name, avatar, size = "sm" }: { name: string; avatar?: string; size?: "sm" | "md" }) {
  const colors = [
    "bg-neon-green/15 text-neon-green border-neon-green/25",
    "bg-neon-blue/15 text-neon-blue border-neon-blue/25",
    "bg-neon-purple/15 text-neon-purple border-neon-purple/25",
    "bg-yellow-400/15 text-yellow-400 border-yellow-400/25",
  ];
  const sz = size === "md" ? "w-6 h-6 text-[11px]" : "w-5 h-5 text-[10px]";
  if (avatar) {
    return <img src={avatar} alt={name} className={`${sz} rounded-full object-cover flex-shrink-0`} />;
  }
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <span className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0 border ${colors[idx]}`}>
      {name[0].toUpperCase()}
    </span>
  );
}

function readingTime(content: string, locale: string): string {
  const words = content.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return locale === "ru" ? `~${mins} мин` : `~${mins} min`;
}

function wasEdited(item: { created_at: string; updated_at: string }): boolean {
  return Math.abs(new Date(item.updated_at).getTime() - new Date(item.created_at).getTime()) > 60_000;
}

export default function Home() {
  useServerWebSocket();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { user, logout, isAuthenticated } = useAuth();
  const { siteName } = useSiteSettings();
  const { data: servers, isLoading, refetch, isRefetching } = useServers();
  const { mutate: deleteServer } = useDeleteServer();
  const qc = useQueryClient();
  const { favorites, toggle: toggleFavorite } = useFavorites();

  const [modalServer, setModalServer] = useState<Server | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [compareIDs, setCompareIDs] = useState<Set<number>>(new Set());
  const [gameFilter, setGameFilter] = useState<GameType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [favOnly, setFavOnly] = useState(false);
  const [newsModal, setNewsModal] = useState<NewsItem | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // News state
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [newsPage, setNewsPage] = useState(1);
  const [newsSearchInput, setNewsSearchInput] = useState("");
  const [newsSearch, setNewsSearch] = useState("");
  const [newsTag, setNewsTag] = useState("");
  const [newsFilterPinned, setNewsFilterPinned] = useState(false);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);

  // Debounce news search input → newsSearch
  useEffect(() => {
    const timer = setTimeout(() => setNewsSearch(newsSearchInput), 300);
    return () => clearTimeout(timer);
  }, [newsSearchInput]);

  const fetchNews = useCallback(async (page: number, search: string, tag: string) => {
    setNewsLoadingMore(true);
    try {
      const result = await api.getNews({
        page,
        search: search || undefined,
        tag: tag || undefined,
      });
      setAllNews((prev) => page === 1 ? result.items : [...prev, ...result.items]);
      setNewsTotal(result.total);
      setNewsPage(page);
    } finally {
      setNewsLoadingMore(false);
    }
  }, []);

  // Re-fetch from page 1 when search or tag filter changes
  useEffect(() => {
    fetchNews(1, newsSearch, newsTag);
  }, [newsSearch, newsTag, fetchNews]);

  const loadMoreNews = () => fetchNews(newsPage + 1, newsSearch, newsTag);

  const openNewsModal = useCallback((item: NewsItem) => {
    setNewsModal(item);
    setReadProgress(0);
    api.trackView(item.id);
    setAllNews((prev) => prev.map((n) => n.id === item.id ? { ...n, views: (n.views ?? 0) + 1 } : n));
  }, []);

  const copyNewsLink = (id: number) => {
    const url = `${window.location.origin}${window.location.pathname}?news=${id}`;
    navigator.clipboard.writeText(url).then(() => toast(t.toastLinkCopied));
  };

  // Collect unique tags from all loaded news
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allNews.forEach((n) => parseTags(n).forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [allNews]);

  // Local pinned filter (backend already orders pinned first)
  const visibleNews = newsFilterPinned ? allNews.filter((n) => n.pinned) : allNews;

  // Keyboard shortcuts: R = refresh, N = new server; ←/→ navigate news modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setCmdPaletteOpen(true); return; }
      if (e.key === "r" || e.key === "R") { refetch(); toast(t.toastRefreshed); }
      if (e.key === "n" || e.key === "N") setModalServer("new");
      if (newsModal && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const idx = visibleNews.findIndex((n) => n.id === newsModal.id);
        if (e.key === "ArrowLeft" && idx > 0) openNewsModal(visibleNews[idx - 1]);
        if (e.key === "ArrowRight" && idx < visibleNews.length - 1) openNewsModal(visibleNews[idx + 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refetch, t, newsModal, visibleNews, openNewsModal]);

  // Pre-status filter (for showing counts on Online/Offline buttons)
  const preStatusFiltered = useMemo(() => (servers ?? []).filter((srv) => {
    if (gameFilter !== "all" && srv.game_type !== gameFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(srv.title || "").toLowerCase().includes(q) &&
        !srv.ip.toLowerCase().includes(q) &&
        !(srv.status?.server_name || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [servers, gameFilter, search]);

  const onlineFilterCount  = preStatusFiltered.filter((s) => s.status?.online_status).length;
  const offlineFilterCount = preStatusFiltered.filter((s) => !s.status?.online_status).length;

  const filtered = useMemo(() => preStatusFiltered.filter((srv) => {
    if (statusFilter === "online" && !srv.status?.online_status) return false;
    if (statusFilter === "offline" && srv.status?.online_status !== false) return false;
    return true;
  }), [preStatusFiltered, statusFilter]);

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
    const base = favOnly ? filtered.filter((s) => favorites.includes(s.id)) : filtered;
    const favs = base.filter((s) => favorites.includes(s.id));
    const rest = base.filter((s) => !favorites.includes(s.id));
    return [...sortFn(favs), ...sortFn(rest)];
  }, [filtered, sortMode, favorites, favOnly]);

  const onlineCount = (servers ?? []).filter((s) => s.status?.online_status).length;
  const newsModalIdx = newsModal ? visibleNews.findIndex((n) => n.id === newsModal.id) : -1;

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

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <SiteBrand size="lg" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            <span className="text-xs text-muted-foreground">{t.onlineCount(onlineCount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCmdPaletteOpen(true)}
              title={locale === "ru" ? "Быстрый поиск (Ctrl+K)" : "Quick search (Ctrl+K)"}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-muted-foreground border border-white/10 hover:border-white/20 hover:text-foreground transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <kbd className="font-mono opacity-60">⌘K</kbd>
            </button>
            <ThemeToggle />
            <LanguageSwitcher />
            {isAuthenticated && user && (
              <>
                <a href="/profile" className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-xl hover:bg-white/5 transition-all">
                  {user.avatar
                    ? <img src={user.avatar} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                    : <User className="w-3.5 h-3.5 flex-shrink-0" />
                  }
                  {user.username}
                </a>
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
                  {t.adminBtn}
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
            {user && (
              <button onClick={() => setModalServer("new")} title="N" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t.addServer}</span>
              </button>
            )}
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
              <a href="/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-white/5 transition-colors">
                {user.avatar
                  ? <img src={user.avatar} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                  : <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                }
                <span className="font-medium">{user.username}</span>
              </a>
            )}
            {isAuthenticated && user?.role === "admin" && (
              <>
                <a href="/admin/news" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-blue-400 hover:bg-blue-400/10 transition-colors">
                  <Newspaper className="w-4 h-4" />{t.newsAdminLink}
                </a>
                <a href="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                  <Shield className="w-4 h-4" />{t.adminBtn}
                </a>
              </>
            )}
            {isAuthenticated ? (
              <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors text-left">
                <LogOut className="w-4 h-4" />{t.authLogout}
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
        {(allNews.length > 0 || newsSearch || newsTag) && (
          <section className="flex flex-col gap-4">
            {/* Section header */}
            <div className="flex items-center gap-2 flex-wrap">
              <Newspaper className="w-4 h-4 text-neon-blue flex-shrink-0" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">{t.newsTitle}</h2>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-neon-blue/10 text-neon-blue/80 border border-neon-blue/20">{newsTotal}</span>

              <a
                href="/api/v1/news.rss"
                target="_blank"
                rel="noopener noreferrer"
                title="RSS"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-orange-400/20 text-orange-400 hover:bg-orange-400/10 transition-all"
              >
                <Rss className="w-3 h-3" />
                RSS
              </a>

              {/* Pinned filter toggle */}
              <button
                onClick={() => setNewsFilterPinned((v) => !v)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                  newsFilterPinned
                    ? "bg-neon-green/10 border-neon-green/30 text-neon-green"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
              >
                <Pin className="w-3 h-3" />
                {t.newsFilterPinned}
              </button>

              {/* Search */}
              <div className="ml-auto flex items-center gap-1.5 relative">
                <Search className="w-3 h-3 text-muted-foreground absolute left-2.5 pointer-events-none" />
                <input
                  value={newsSearchInput}
                  onChange={(e) => setNewsSearchInput(e.target.value)}
                  placeholder={t.newsSearchPlaceholder}
                  className="bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1 text-xs outline-none focus:border-neon-blue/40 transition-all placeholder:text-muted-foreground w-40 sm:w-52"
                />
                {newsSearchInput && (
                  <button
                    onClick={() => setNewsSearchInput("")}
                    className="absolute right-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Tag filter pills */}
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap -mt-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setNewsTag(newsTag === tag ? "" : tag)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                      newsTag === tag
                        ? "bg-neon-blue/15 border-neon-blue/40 text-neon-blue"
                        : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Featured first item */}
            {visibleNews[0] && (
              <div
                onClick={() => openNewsModal(visibleNews[0])}
                className="relative glass-card rounded-2xl cursor-pointer group border border-neon-blue/20 hover:border-neon-blue/45 transition-all overflow-hidden"
              >
                {/* Cover image */}
                {visibleNews[0].image_url && (
                  <img
                    src={visibleNews[0].image_url}
                    alt=""
                    className="w-full h-32 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                {/* Gradient bg overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/[0.06] via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-neon-blue/40 to-transparent" />
                <div className="relative flex flex-col gap-3 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[10px] font-bold text-neon-blue/70 uppercase tracking-widest">📢 {t.newsTitle}</span>
                        {visibleNews[0].pinned && (
                          <span className="flex items-center gap-0.5 text-[10px] text-neon-green font-semibold">
                            <Pin className="w-2.5 h-2.5" /> {t.newsPinned}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base sm:text-lg font-bold leading-snug group-hover:text-neon-blue transition-colors duration-200 line-clamp-2">
                        {visibleNews[0].title}
                      </h3>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-neon-blue/60 transition-colors flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(visibleNews[0].content) }}
                  />
                  {/* Tags */}
                  {parseTags(visibleNews[0]).length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {parseTags(visibleNews[0]).map((tag) => (
                        <span
                          key={tag}
                          onClick={(e) => { e.stopPropagation(); setNewsTag(newsTag === tag ? "" : tag); }}
                          className="px-2 py-0.5 rounded-full text-[10px] bg-neon-blue/10 text-neon-blue border border-neon-blue/20 cursor-pointer hover:bg-neon-blue/20 transition-colors"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-3 border-t border-white/[0.06]">
                    {visibleNews[0].author_name && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <AuthorAvatar name={visibleNews[0].author_name} avatar={visibleNews[0].author_avatar} size="md" />
                        <span>{visibleNews[0].author_name}</span>
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      {wasEdited(visibleNews[0]) && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
                          <Pencil className="w-2.5 h-2.5" />
                          {locale === "ru" ? "ред." : "edited"}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
                        <Clock className="w-3 h-3" />
                        {readingTime(visibleNews[0].content, locale)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
                        <CalendarDays className="w-3 h-3" />
                        {relativeTime(visibleNews[0].created_at, locale)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Remaining items */}
            {visibleNews.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleNews.slice(1).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => openNewsModal(item)}
                    className="glass-card rounded-2xl overflow-hidden flex flex-col cursor-pointer group hover:border-white/16 transition-all"
                  >
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-20 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex items-start gap-1.5 flex-wrap">
                        {item.pinned && <Pin className="w-3 h-3 text-neon-green flex-shrink-0 mt-0.5" />}
                        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-neon-blue transition-colors duration-200">
                          {item.title}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(item.content) }}
                      />
                      {parseTags(item).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {parseTags(item).slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              onClick={(e) => { e.stopPropagation(); setNewsTag(newsTag === tag ? "" : tag); }}
                              className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/5 text-muted-foreground border border-white/10 cursor-pointer hover:border-neon-blue/30 hover:text-neon-blue transition-colors"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                        {item.author_name && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                            <AuthorAvatar name={item.author_name} avatar={item.author_avatar} />
                            <span className="truncate max-w-[70px]">{item.author_name}</span>
                          </div>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {wasEdited(item) && <Pencil className="w-2.5 h-2.5 text-muted-foreground/40" />}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground/40">
                            <Clock className="w-2.5 h-2.5" />{readingTime(item.content, locale)}
                          </span>
                          {item.views > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground/40">
                              <Eye className="w-2.5 h-2.5" />{item.views}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load more */}
            {allNews.length < newsTotal && !newsFilterPinned && (
              <div className="flex justify-center">
                <button
                  onClick={loadMoreNews}
                  disabled={newsLoadingMore}
                  className="px-5 py-2 rounded-xl text-sm font-medium border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all disabled:opacity-50"
                >
                  {newsLoadingMore ? t.chartLoading : t.newsLoadMore}
                </button>
              </div>
            )}

            {/* No results */}
            {allNews.length === 0 && !newsLoadingMore && (newsSearch || newsTag) && (
              <p className="text-center text-sm text-muted-foreground py-8">{t.newsEmpty}</p>
            )}
          </section>
        )}

        <StatsOverview />

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-neon-green/40 transition-all placeholder:text-muted-foreground pr-9" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-shrink-0">
            {(["all", "online", "offline"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? t.filterAll : s === "online" ? `${t.filterOnline} (${onlineFilterCount})` : `${t.filterOffline} (${offlineFilterCount})`}
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
        <div className="flex items-center justify-between gap-3 sm:-mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground hidden sm:block">{t.sortBy}</span>
            <div className="flex gap-1 bg-white/5 rounded-xl p-1">
              {sortOptions.map((s) => (
                <button key={s.key} onClick={() => setSortMode(s.key)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${sortMode === s.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFavOnly((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${favOnly ? "bg-yellow-400/10 border-yellow-400/40 text-yellow-400" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"}`}
            >
              ★ {t.favOnly}{favOnly && favorites.length > 0 ? ` (${favorites.length})` : ""}
            </button>
          </div>
          <button onClick={exportJSON} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.exportJson}</span>
          </button>
        </div>

        {/* Server grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <ServerCardSkeleton key={i} />)}
          </div>
        ) : sorted.length === 0 && favOnly ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 flex items-center justify-center"><span className="text-3xl">★</span></div>
            <div>
              <p className="font-semibold">{t.favOnly}</p>
              <p className="text-sm text-muted-foreground mt-1">{t.favPin} ★</p>
            </div>
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
          <>
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 transition-opacity duration-300 ${isRefetching ? "opacity-60" : "opacity-100"}`}>
              {sorted.map((srv) => {
                const canManage = user?.role === "admin" || user?.id === srv.owner_id;
                const inCompare = compareIDs.has(srv.id);
                return (
                  <div key={srv.id} id={`server-${srv.id}`} className={`relative group ${inCompare ? "ring-2 ring-neon-blue/50 rounded-2xl" : ""}`}>
                    <ServerCard
                      server={srv}
                      isFavorite={favorites.includes(srv.id)}
                      onToggleFavorite={() => toggleFavorite(srv.id)}
                      onEdit={canManage ? (s) => setModalServer(s) : undefined}
                      onDelete={canManage ? () => setDeleteTarget(srv) : undefined}
                    />
                    <button
                      onClick={() => setCompareIDs((prev) => {
                        const next = new Set(prev);
                        if (next.has(srv.id)) next.delete(srv.id);
                        else if (next.size < 4) next.add(srv.id);
                        return next;
                      })}
                      title={t.compareAdd}
                      className={`absolute top-3 right-3 p-1.5 rounded-lg border transition-all z-10 ${
                        inCompare
                          ? "bg-neon-blue/20 border-neon-blue/40 text-neon-blue"
                          : "bg-black/40 border-white/10 text-muted-foreground hover:text-neon-blue hover:border-neon-blue/30 sm:opacity-0 sm:group-hover:opacity-100"
                      }`}
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {compareIDs.size >= 2 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3 border border-neon-blue/20 shadow-lg shadow-black/40">
                  <GitCompare className="w-4 h-4 text-neon-blue" />
                  <span className="text-sm font-semibold text-neon-blue">{compareIDs.size} {t.compareSelectHint}</span>
                  <button
                    onClick={() => router.push(`/compare?ids=${Array.from(compareIDs).join(",")}`)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neon-blue/20 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/30 transition-colors"
                  >
                    {t.compareOpenBtn}
                  </button>
                  <button
                    onClick={() => setCompareIDs(new Set())}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>{siteName} © {new Date().getFullYear()} · <span className="opacity-50">{APP_VERSION}</span></span>
          <span>{t.footerBuiltWith} <span className="text-neon-green">Go</span> + <span className="text-neon-blue">Next.js</span></span>
        </div>
      </footer>

      {/* News article modal */}
      {newsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setNewsModal(null); }}
        >
          <div className="w-full max-w-2xl glass-card rounded-2xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col animate-fade-in border border-neon-blue/20">
            {/* Cover image */}
            {newsModal.image_url && (
              <img
                src={newsModal.image_url}
                alt=""
                className="w-full h-36 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {/* Modal header */}
            <div className="relative flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-white/8">
              <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-neon-blue/40 to-transparent" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold text-neon-blue/70 uppercase tracking-widest">📢 {t.newsTitle}</span>
                  {newsModal.pinned && (
                    <span className="flex items-center gap-0.5 text-[10px] text-neon-green font-semibold">
                      <Pin className="w-2.5 h-2.5" /> {t.newsPinned}
                    </span>
                  )}
                </div>
                <h2 className="font-bold text-xl leading-snug mb-3">{newsModal.title}</h2>
                {/* Tags */}
                {parseTags(newsModal).length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-3">
                    {parseTags(newsModal).map((tag) => (
                      <span
                        key={tag}
                        onClick={() => { setNewsModal(null); setNewsTag(newsTag === tag ? "" : tag); }}
                        className="px-2 py-0.5 rounded-full text-[10px] bg-neon-blue/10 text-neon-blue border border-neon-blue/20 cursor-pointer hover:bg-neon-blue/20 transition-colors"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {newsModal.author_name && (
                    <div className="flex items-center gap-1.5">
                      <AuthorAvatar name={newsModal.author_name} avatar={newsModal.author_avatar} size="md" />
                      <span>{newsModal.author_name}</span>
                    </div>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground/50">
                    <CalendarDays className="w-3 h-3" />
                    {relativeTime(newsModal.created_at, locale)}
                  </span>
                  {wasEdited(newsModal) && (
                    <span className="flex items-center gap-1 text-muted-foreground/40">
                      <Pencil className="w-2.5 h-2.5" />
                      {locale === "ru" ? `обновлено ${relativeTime(newsModal.updated_at, locale)}` : `edited ${relativeTime(newsModal.updated_at, locale)}`}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground/40">
                    <Clock className="w-3 h-3" />
                    {readingTime(newsModal.content, locale)}
                  </span>
                  {newsModal.views > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground/40">
                      <Eye className="w-3 h-3" />
                      {newsModal.views} {t.newsViews}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => copyNewsLink(newsModal.id)}
                  title={t.toastLinkCopied}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button onClick={() => setNewsModal(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Reading progress bar */}
            <div className="h-0.5 bg-white/5 flex-shrink-0">
              <div
                className="h-full bg-neon-blue transition-all duration-150"
                style={{ width: `${readProgress}%` }}
              />
            </div>
            {/* Article body */}
            <div
              ref={articleBodyRef}
              className="px-6 py-6 overflow-y-auto prose-sm"
              onScroll={(e) => {
                const el = e.currentTarget;
                const max = el.scrollHeight - el.clientHeight;
                setReadProgress(max > 0 ? Math.round(el.scrollTop / max * 100) : 100);
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(newsModal.content) }}
            />
            {/* Article navigation */}
            {(newsModalIdx > 0 || newsModalIdx < visibleNews.length - 1) && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 flex-shrink-0 gap-4">
                {newsModalIdx > 0 ? (
                  <button
                    onClick={() => openNewsModal(visibleNews[newsModalIdx - 1])}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group max-w-[45%]"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate group-hover:text-neon-blue transition-colors">{visibleNews[newsModalIdx - 1].title}</span>
                  </button>
                ) : <div />}
                {newsModalIdx < visibleNews.length - 1 ? (
                  <button
                    onClick={() => openNewsModal(visibleNews[newsModalIdx + 1])}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group ml-auto max-w-[45%]"
                  >
                    <span className="truncate group-hover:text-neon-blue transition-colors">{visibleNews[newsModalIdx + 1].title}</span>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  </button>
                ) : <div />}
              </div>
            )}
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

      {cmdPaletteOpen && (
        <CommandPalette
          servers={servers ?? []}
          onSelectServer={(srv) => {
            const el = document.getElementById(`server-${srv.id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onClose={() => setCmdPaletteOpen(false)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
