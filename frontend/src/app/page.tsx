"use client";

import { useState } from "react";
import { Plus, RefreshCw, Gamepad2, Zap } from "lucide-react";
import { useServers, useDeleteServer } from "@/hooks/useServers";
import { useServerWebSocket } from "@/hooks/useWebSocket";
import ServerCard from "@/components/ServerCard";
import StatsOverview from "@/components/StatsOverview";
import AddServerModal from "@/components/AddServerModal";
import type { GameType } from "@/types/server";

const GAME_FILTERS: { label: string; value: GameType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "⚙️ Source", value: "source" },
  { label: "⛏️ Minecraft", value: "minecraft" },
  { label: "🚗 FiveM", value: "fivem" },
];

export default function Home() {
  useServerWebSocket(); // Подключаемся к WS для live-обновлений

  const { data: servers, isLoading, refetch, isRefetching } = useServers();
  const { mutate: deleteServer } = useDeleteServer();

  const [addOpen, setAddOpen] = useState(false);
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

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 bg-neon-green/20 border border-neon-green/40 rounded-xl flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-neon-green" />
            </div>
            <span className="font-black text-lg tracking-tight">
              JS<span className="text-neon-green">Monitor</span>
            </span>
          </div>

          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            <span className="text-xs text-muted-foreground">
              {onlineCount} online
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              title="Refresh"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Server</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Stats */}
        <StatsOverview />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search servers…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-4 py-2.5 text-sm outline-none focus:border-neon-green/40 transition-all placeholder:text-muted-foreground"
            />
          </div>

          {/* Status filter */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-shrink-0">
            {(["all", "online", "offline"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  statusFilter === s
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Game filter */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto flex-shrink-0">
            {GAME_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setGameFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  gameFilter === f.value
                    ? "bg-neon-green/20 text-neon-green border border-neon-green/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Server grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="glass-card rounded-2xl h-56 animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <Zap className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No servers found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {(servers ?? []).length === 0
                  ? "Add your first server to get started"
                  : "Try adjusting filters"}
              </p>
            </div>
            {(servers ?? []).length === 0 && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add First Server
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((srv) => (
              <ServerCard
                key={srv.id}
                server={srv}
                onDelete={(id) => {
                  if (confirm(`Delete "${srv.title}"?`)) deleteServer(id);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>JSMonitor © {new Date().getFullYear()}</span>
          <span className="flex items-center gap-1">
            Built with <span className="text-neon-green">Go</span> + <span className="text-neon-blue">Next.js</span>
          </span>
        </div>
      </footer>

      {/* Modal */}
      {addOpen && <AddServerModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
