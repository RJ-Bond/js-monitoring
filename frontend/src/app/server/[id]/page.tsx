"use client";

import { useState } from "react";
import { Users, Map, Wifi, ArrowLeft, ExternalLink, Star, Copy } from "lucide-react";
import { useServer, useHistory, useLeaderboard, useServerPlayers } from "@/hooks/useServers";
import { useUptime } from "@/hooks/useUptime";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFavorites } from "@/hooks/useFavorites";
import { cn, formatPlayers, formatPing, buildJoinLink, gameTypeLabel } from "@/lib/utils";
import { toast } from "@/lib/toast";
import StatusIndicator from "@/components/StatusIndicator";
import PlayerChart from "@/components/PlayerChart";
import PlayerLeaderboard from "@/components/PlayerLeaderboard";
import GameIcon from "@/components/GameIcon";
import SiteBrand from "@/components/SiteBrand";
import { ToastContainer } from "@/components/Toast";
import type { LeaderboardEntry } from "@/types/server";

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 0x1f1a5))
    .join("");
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ServerDetailPage({ params }: { params: { id: string } }) {
  const serverId = parseInt(params.id, 10);
  const { t, locale } = useLanguage();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const [tab, setTab] = useState<"history" | "leaderboard" | "players">("history");

  const { data: server, isLoading } = useServer(serverId);
  const { data: uptimeData } = useUptime(serverId);
  const { data: leaderboard } = useLeaderboard(serverId, "7d");
  const status = server?.status;
  const online = status?.online_status ?? false;

  const showPlayers = tab === "players" && online && (status?.players_now ?? 0) > 0;
  const { data: players, isLoading: playersLoading } = useServerPlayers(serverId, showPlayers);

  const isFavorite = favorites.includes(serverId);

  const pingMs = status?.ping_ms ?? 0;
  const pingColor = !online ? "text-muted-foreground"
    : pingMs < 50 ? "text-neon-green"
    : pingMs < 120 ? "text-yellow-400"
    : "text-red-400";
  const pingDotColor = !online ? "bg-muted-foreground/30"
    : pingMs < 50 ? "bg-neon-green"
    : pingMs < 120 ? "bg-yellow-400"
    : "bg-red-400";

  const fillRatio = online && status?.players_max ? status.players_now / status.players_max : 0;

  const copyIP = () => {
    if (!server) return;
    navigator.clipboard.writeText(`${server.display_ip || server.ip}:${server.port}`)
      .then(() => toast(t.toastCopied));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">{t.chartLoading}</div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="min-h-screen bg-background bg-grid flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Server not found</p>
        <a href="/" className="text-neon-green hover:underline text-sm">{t.serverDetailBack}</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <a href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t.serverDetailBack}</span>
          </a>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <GameIcon gameType={server.game_type} />
            <span className="font-semibold truncate text-foreground">
              {server.title || status?.server_name || server.ip}
            </span>
          </div>
          <SiteBrand size="sm" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Hero card */}
        <div className="glass-card rounded-2xl p-6 flex flex-col gap-5 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{
              background: online
                ? "linear-gradient(90deg,#00ff88,#00d4ff)"
                : "linear-gradient(90deg,#6b7280,#374151)",
            }}
          />

          {/* Server meta */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <GameIcon gameType={server.game_type} />
                <h1 className="font-bold text-xl text-foreground truncate">
                  {server.title || status?.server_name || server.ip}
                </h1>
              </div>
              <button
                onClick={copyIP}
                className="flex items-center gap-1 text-sm text-muted-foreground font-mono hover:text-foreground transition-colors group"
              >
                {server.display_ip || server.ip}:{server.port}
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                <span>{gameTypeLabel(server.game_type)}</span>
                {server.country_code && (
                  <span className="flex items-center gap-1">
                    {countryFlag(server.country_code)} {server.country_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusIndicator online={online} showLabel />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleFavorite(serverId)}
                  className={cn("p-1.5 rounded-lg transition-colors", isFavorite ? "text-yellow-400 bg-yellow-400/10" : "text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10")}
                >
                  <Star className={cn("w-4 h-4", isFavorite && "fill-current")} />
                </button>
                {online && (
                  <a
                    href={buildJoinLink(server.game_type, server.ip, server.port, server.display_ip)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />{t.playNow}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1.5 bg-white/5 rounded-xl p-4">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-lg font-bold text-foreground">
                {online ? formatPlayers(status!.players_now, status!.players_max) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">{t.cardPlayers}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 bg-white/5 rounded-xl p-4">
              <Wifi className="w-5 h-5 text-muted-foreground" />
              <span className={cn("flex items-center gap-1.5 text-lg font-bold", pingColor)}>
                <span className="relative inline-flex items-center justify-center w-2 h-2">
                  {online && <span className={cn("absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping", pingDotColor)} />}
                  <span className={cn("relative w-1.5 h-1.5 rounded-full", pingDotColor)} />
                </span>
                {online ? formatPing(pingMs) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">{t.cardPing}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 bg-white/5 rounded-xl p-4 overflow-hidden">
              <Map className="w-5 h-5 text-muted-foreground" />
              <span className="text-lg font-bold text-foreground truncate max-w-full px-1">
                {online && status?.current_map ? status.current_map : "—"}
              </span>
              <span className="text-xs text-muted-foreground">{t.cardMap}</span>
            </div>
          </div>

          {/* Uptime + fill bar */}
          <div className="flex flex-col gap-3">
            {uptimeData !== undefined && uptimeData.total > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium",
                  uptimeData.uptime_24h >= 95 ? "border-neon-green/30 text-neon-green bg-neon-green/10"
                    : uptimeData.uptime_24h >= 70 ? "border-yellow-400/30 text-yellow-400 bg-yellow-400/10"
                    : "border-red-400/30 text-red-400 bg-red-400/10",
                )}>
                  ⬆ {uptimeData.uptime_24h.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">{t.cardUptime}</span>
                <span className="text-muted-foreground/50">
                  {uptimeData.online}/{uptimeData.total} {locale === "ru" ? "проверок" : "checks"}
                </span>
              </div>
            )}
            {online && status && status.players_max > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t.cardOccupancy}</span>
                  <span>{Math.round(fillRatio * 100)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{
                    width: `${Math.min(100, fillRatio * 100)}%`,
                    background: fillRatio > 0.9
                      ? "linear-gradient(90deg,#ff6644,#ff2244)"
                      : fillRatio > 0.6
                        ? "linear-gradient(90deg,#ffaa00,#ff8800)"
                        : "linear-gradient(90deg,#00ff88,#00d4ff)",
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {(["history", "leaderboard", "players"] as const).map((key) => {
            const labels: Record<string, string> = {
              history: t.serverDetailHistory,
              leaderboard: t.serverDetailLeaderboard,
              players: t.serverDetailOnlinePlayers,
            };
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  tab === key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {labels[key]}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="glass-card rounded-2xl p-5">
          {tab === "history" && <PlayerChart serverId={serverId} />}
          {tab === "leaderboard" && <PlayerLeaderboard serverId={serverId} />}
          {tab === "players" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {t.serverDetailOnlinePlayers}
                {!playersLoading && players ? ` (${players.length})` : ""}
              </p>
              {!online ? (
                <p className="text-sm text-muted-foreground">{t.statusOffline}</p>
              ) : playersLoading ? (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-7 w-24 bg-white/5 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : players && players.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {players.map((p, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.playersNoData}</p>
              )}
            </div>
          )}
        </div>

        {/* Leaderboard mini-table (always visible below tabs) */}
        {leaderboard && leaderboard.length > 0 && tab !== "leaderboard" && (
          <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t.serverDetailLeaderboard}</p>
            <div className="flex flex-col gap-1">
              {leaderboard.slice(0, 5).map((entry: LeaderboardEntry, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                  <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium text-foreground truncate">{entry.player_name}</span>
                  <span className="text-xs text-muted-foreground">{formatSeconds(entry.total_seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <ToastContainer />
    </div>
  );
}
