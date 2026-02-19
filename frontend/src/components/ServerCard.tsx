"use client";

import { useState } from "react";
import { Users, Map, Wifi, Terminal, ExternalLink, Trash2, ChevronDown, Pencil } from "lucide-react";
import { cn, formatPlayers, formatPing, buildJoinLink, gameTypeLabel } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useServerPlayers } from "@/hooks/useServers";
import StatusIndicator from "./StatusIndicator";
import PlayerChart from "./PlayerChart";
import RconConsole from "./RconConsole";
import GameIcon from "./GameIcon";
import type { Server } from "@/types/server";

interface ServerCardProps {
  server: Server;
  onDelete?: (id: number) => void;
  onEdit?: (server: Server) => void;
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 0x1f1a5))
    .join("");
}

const PLAYER_SUPPORTED: Server["game_type"][] = [
  "source", "fivem", "gmod", "valheim", "dayz", "squad", "vrising", "icarus", "terraria",
  "samp", "minecraft", "minecraft_bedrock",
];

export default function ServerCard({ server, onDelete, onEdit }: ServerCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [rconOpen, setRconOpen] = useState(false);
  const status = server.status;
  const online = status?.online_status ?? false;

  const showPlayers = expanded && online && (status?.players_now ?? 0) > 0 && PLAYER_SUPPORTED.includes(server.game_type);
  const { data: players, isLoading: playersLoading } = useServerPlayers(server.id, showPlayers);

  const serverNameDiffers = online && status?.server_name && status.server_name !== server.title;

  return (
    <>
      <div className={cn("glass-card rounded-2xl p-5 flex flex-col gap-4 animate-slide-up", online ? "card-glow-online" : "card-glow-offline")}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <GameIcon gameType={server.game_type} />
              <h3 className="font-bold text-base truncate text-foreground">{server.title}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground font-mono truncate">{server.ip}:{server.port}</p>
              {server.country_code && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>{countryFlag(server.country_code)}</span>
                  <span className="truncate max-w-[80px]">{server.country_name}</span>
                </span>
              )}
            </div>
            {serverNameDiffers && (
              <p className="text-xs text-muted-foreground/70 italic truncate mt-0.5">{status!.server_name}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{gameTypeLabel(server.game_type)}</p>
          </div>
          <StatusIndicator online={online} showLabel />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-2.5">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{online ? formatPlayers(status!.players_now, status!.players_max) : "—"}</span>
            <span className="text-xs text-muted-foreground">{t.cardPlayers}</span>
          </div>
          <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-2.5">
            <Wifi className="w-4 h-4 text-muted-foreground" />
            <span className={cn("text-sm font-bold", !online ? "text-muted-foreground" : (status?.ping_ms ?? 0) < 50 ? "text-neon-green" : (status?.ping_ms ?? 0) < 120 ? "text-yellow-400" : "text-red-400")}>
              {online ? formatPing(status!.ping_ms) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">{t.cardPing}</span>
          </div>
          <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-2.5 overflow-hidden">
            <Map className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-bold text-foreground truncate max-w-full px-1">{online && status?.current_map ? status.current_map : "—"}</span>
            <span className="text-xs text-muted-foreground">{t.cardMap}</span>
          </div>
        </div>

        {/* Occupancy bar */}
        {online && status && status.players_max > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t.cardOccupancy}</span>
              <span>{Math.round((status.players_now / status.players_max) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{
                width: `${Math.min(100, (status.players_now / status.players_max) * 100)}%`,
                background: status.players_now / status.players_max > 0.9
                  ? "linear-gradient(90deg, #ff6644, #ff2244)"
                  : status.players_now / status.players_max > 0.6
                    ? "linear-gradient(90deg, #ffaa00, #ff8800)"
                    : "linear-gradient(90deg, #00ff88, #00d4ff)",
              }} />
            </div>
          </div>
        )}

        {/* Expanded: chart + player list */}
        {expanded && (
          <>
            <PlayerChart serverId={server.id} />
            {showPlayers && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t.playersOnline} {!playersLoading && players ? `(${players.length})` : ""}
                </p>
                {playersLoading ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-5 w-20 bg-white/5 rounded animate-pulse" />
                    ))}
                  </div>
                ) : players && players.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {players.map((p, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground truncate max-w-[140px]"
                        title={p.name}
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t.playersNoData}</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", expanded && "rotate-180")} />
            {expanded ? t.hideChart : t.viewChart}
          </button>
          <div className="flex-1" />
          {server.game_type !== "fivem" && server.game_type !== "samp" && (
            <button onClick={() => setRconOpen(true)} title="RCON" className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-green hover:bg-neon-green/10 transition-colors">
              <Terminal className="w-4 h-4" />
            </button>
          )}
          {online && (
            <a href={buildJoinLink(server.game_type, server.ip, server.port)} title={t.playNow} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />{t.playNow}
            </a>
          )}
          {onEdit && (
            <button onClick={() => onEdit(server)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button onClick={() => { if (confirm(t.confirmDelete(server.title))) onDelete(server.id); }} title={t.deleteServer} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {rconOpen && <RconConsole serverId={server.id} serverTitle={server.title} apiKey={process.env.NEXT_PUBLIC_API_SECRET_KEY ?? ""} onClose={() => setRconOpen(false)} />}
    </>
  );
}
