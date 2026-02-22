"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Server, User, Settings, Newspaper, BarChart2, Trophy, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import GameIcon from "./GameIcon";
import StatusIndicator from "./StatusIndicator";
import type { Server as ServerType } from "@/types/server";

interface CommandPaletteProps {
  servers: ServerType[];
  onSelectServer?: (server: ServerType) => void;
  onClose: () => void;
}

interface NavItem {
  label: string;
  labelRu: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Profile",    labelRu: "Профиль",        href: "/profile",   icon: <User className="w-4 h-4" /> },
  { label: "Leaderboard",labelRu: "Таблица лидеров", href: "/leaderboard",icon: <Trophy className="w-4 h-4" /> },
  { label: "News",       labelRu: "Новости",         href: "/?news",     icon: <Newspaper className="w-4 h-4" /> },
  { label: "Admin Panel",labelRu: "Админ панель",    href: "/admin",     icon: <Settings className="w-4 h-4" />, adminOnly: true },
  { label: "Stats",      labelRu: "Статистика",      href: "/admin?tab=stats", icon: <BarChart2 className="w-4 h-4" />, adminOnly: true },
];

export default function CommandPalette({ servers, onSelectServer, onClose }: CommandPaletteProps) {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const isAdmin = user?.role === "admin";

  const filteredNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin],
  );

  const filteredServers = useMemo(() => {
    if (!query.trim()) return servers.slice(0, 6);
    const q = query.toLowerCase();
    return servers
      .filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          s.ip.toLowerCase().includes(q) ||
          (s.status?.server_name || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [servers, query]);

  const filteredNav = useMemo(() => {
    if (!query.trim()) return filteredNavItems;
    const q = query.toLowerCase();
    return filteredNavItems.filter(
      (n) => n.label.toLowerCase().includes(q) || n.labelRu.toLowerCase().includes(q),
    );
  }, [filteredNavItems, query]);

  const items = useMemo(() => {
    return [
      ...filteredNav.map((n) => ({ type: "nav" as const, nav: n })),
      ...filteredServers.map((s) => ({ type: "server" as const, server: s })),
    ];
  }, [filteredNav, filteredServers]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Escape")    { onClose(); }
    if (e.key === "Enter" && items[activeIdx]) {
      const item = items[activeIdx];
      if (item.type === "nav") window.location.href = item.nav.href;
      if (item.type === "server") { onSelectServer?.(item.server); onClose(); }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in border border-white/10">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={locale === "ru" ? "Поиск серверов и навигации…" : "Search servers and navigation…"}
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-white/10 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5">
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {locale === "ru" ? "Ничего не найдено" : "No results found"}
            </li>
          )}

          {/* Navigation section header */}
          {filteredNav.length > 0 && (
            <>
              <li className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                {locale === "ru" ? "Навигация" : "Navigation"}
              </li>
              {filteredNav.map((nav, i) => (
                <li key={nav.href}>
                  <a
                    href={nav.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                      activeIdx === i
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    )}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={onClose}
                  >
                    <span className="text-neon-blue">{nav.icon}</span>
                    {locale === "ru" ? nav.labelRu : nav.label}
                  </a>
                </li>
              ))}
            </>
          )}

          {/* Servers section header */}
          {filteredServers.length > 0 && (
            <>
              <li className="px-4 py-1.5 mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold border-t border-white/5 pt-2.5">
                <div className="flex items-center gap-1.5">
                  <Server className="w-3 h-3" />
                  {locale === "ru" ? "Серверы" : "Servers"}
                  {!query && (
                    <span className="text-muted-foreground/40">
                      {locale === "ru" ? "— недавние" : "— recent"}
                    </span>
                  )}
                </div>
              </li>
              {filteredServers.map((srv, i) => {
                const globalIdx = filteredNav.length + i;
                const name = srv.title || srv.status?.server_name || srv.ip;
                return (
                  <li key={srv.id}>
                    <button
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left",
                        activeIdx === globalIdx
                          ? "bg-white/10 text-foreground"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                      )}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                      onClick={() => { onSelectServer?.(srv); onClose(); }}
                    >
                      <GameIcon gameType={srv.game_type} imgClassName="h-4 w-auto max-w-[2rem] object-contain rounded-sm" emojiClassName="text-sm leading-none" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {srv.display_ip || srv.ip}:{srv.port}
                        </p>
                      </div>
                      <StatusIndicator online={srv.status?.online_status ?? false} size="sm" />
                      {srv.status?.online_status && (
                        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                          {srv.status.players_now}/{srv.status.players_max}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </>
          )}
        </ul>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 text-[10px] text-muted-foreground/50">
          <span><kbd className="font-mono">↑↓</kbd> {locale === "ru" ? "навигация" : "navigate"}</span>
          <span><kbd className="font-mono">↵</kbd> {locale === "ru" ? "выбрать" : "select"}</span>
          <span><kbd className="font-mono">ESC</kbd> {locale === "ru" ? "закрыть" : "close"}</span>
        </div>
      </div>
    </div>
  );
}
