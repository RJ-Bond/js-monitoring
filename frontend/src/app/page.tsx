"use client";

import { useState } from "react";
import { Plus, RefreshCw, Gamepad2, Zap, LogOut, User } from "lucide-react";
import { useServers, useDeleteServer } from "@/hooks/useServers";
import { useServerWebSocket } from "@/hooks/useWebSocket";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import ServerCard from "@/components/ServerCard";
import StatsOverview from "@/components/StatsOverview";
import AddEditServerModal from "@/components/AddEditServerModal";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GameIcon from "@/components/GameIcon";
import type { GameType, Server } from "@/types/server";
import { GAME_META } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function Home() {
  useServerWebSocket();
  const { t } = useLanguage();
  const { user, logout, isAuthenticated } = useAuth();
  const { data: servers, isLoading, refetch, isRefetching } = useServers();
  const { mutate: deleteServer } = useDeleteServer();
  const qc = useQueryClient();

  const [modalServer, setModalServer] = useState<Server | null | "new">(null);
  const [gameFilter, setGameFilter] = useState<GameType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");

  const filtered = (servers ?? []).filter((srv) => {
    if (gameFilter !== "all" && srv.game_type !== gameFilter) return false;
    if (statusFilter === "online" && !srv.status?.online_status) return false;
    if (statusFilter === "offline" && srv.status?.online_status !== false) return false;
    if (search && !srv.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const onlineCount = (servers ?? []).filter((s) => s.status?.online_status).length;

  const handleUpdate = async (id: number, data: Partial<Server>) => {
    await api.updateServer(id, data);
    qc.invalidateQueries({ queryKey: ["servers"] });
  };

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
                <button onClick={logout} title="Logout" className="p-2 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
            {!isAuthenticated && (
              <a href="/login" className="px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all">
                {t.authLogin}
              </a>
            )}
            <button onClick={() => refetch()} disabled={isRefetching} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setModalServer("new")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t.addServer}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <StatsOverview />
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
            {/* "All" filter */}
            <button
              onClick={() => setGameFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${gameFilter === "all" ? "bg-neon-green/20 text-neon-green border border-neon-green/30" : "text-muted-foreground hover:text-foreground"}`}
            >
              🎮
            </button>
            {/* Per-game filters with Steam icons */}
            {(Object.keys(GAME_META) as GameType[]).map((gt) => (
              <button
                key={gt}
                onClick={() => setGameFilter(gt)}
                title={GAME_META[gt].label}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${gameFilter === gt ? "bg-neon-green/20 text-neon-green border border-neon-green/30" : "text-muted-foreground hover:text-foreground"}`}
              >
                <GameIcon
                  gameType={gt}
                  imgClassName="h-4 w-auto max-w-[2.5rem] object-contain rounded-sm"
                  emojiClassName="text-sm leading-none"
                />
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass-card rounded-2xl h-56 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />)}
          </div>
        ) : filtered.length === 0 ? (
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
            {filtered.map((srv) => (
              <ServerCard
                key={srv.id}
                server={srv}
                onEdit={(s) => setModalServer(s)}
                onDelete={(id) => { if (confirm(t.confirmDelete(srv.title))) deleteServer(id); }}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>JSMonitor © {new Date().getFullYear()}</span>
          <span>{t.footerBuiltWith} <span className="text-neon-green">Go</span> + <span className="text-neon-blue">Next.js</span></span>
        </div>
      </footer>

      {modalServer && (
        <AddEditServerModal
          onClose={() => setModalServer(null)}
          editServer={modalServer === "new" ? undefined : modalServer}
          onUpdate={modalServer !== "new" ? (data) => handleUpdate((modalServer as Server).id, data) : undefined}
        />
      )}
    </div>
  );
}
