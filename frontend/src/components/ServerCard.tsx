"use client";

import { useState } from "react";
import { Users, Map, Wifi, Terminal, ExternalLink, Trash2, ChevronDown } from "lucide-react";
import { cn, formatPlayers, formatPing, buildJoinLink, gameTypeLabel } from "@/lib/utils";
import StatusIndicator from "./StatusIndicator";
import PlayerChart from "./PlayerChart";
import RconConsole from "./RconConsole";
import type { Server } from "@/types/server";

interface ServerCardProps {
  server: Server;
  onDelete?: (id: number) => void;
}

const gameIcon: Record<string, string> = {
  source: "⚙️",
  minecraft: "⛏️",
  fivem: "🚗",
};

export default function ServerCard({ server, onDelete }: ServerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rconOpen, setRconOpen] = useState(false);
  const status = server.status;
  const online = status?.online_status ?? false;

  return (
    <>
      <div
        className={cn(
          "glass-card rounded-2xl p-5 flex flex-col gap-4 cursor-pointer group",
          "animate-slide-up",
          online ? "card-glow-online" : "card-glow-offline"
        )}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg leading-none">
                {gameIcon[server.game_type] ?? "🎮"}
              </span>
              <h3 className="font-bold text-base truncate text-foreground">{server.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {server.ip}:{server.port}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {gameTypeLabel(server.game_type)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <StatusIndicator online={online} showLabel />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Players */}
          <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-2.5">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">
              {online ? formatPlayers(status!.players_now, status!.players_max) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">Players</span>
          </div>

          {/* Ping */}
          <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-2.5">
            <Wifi className="w-4 h-4 text-muted-foreground" />
            <span
              className={cn(
                "text-sm font-bold",
                !online
                  ? "text-muted-foreground"
                  : (status?.ping_ms ?? 0) < 50
                    ? "text-neon-green"
                    : (status?.ping_ms ?? 0) < 120
                      ? "text-yellow-400"
                      : "text-red-400"
              )}
            >
              {online ? formatPing(status!.ping_ms) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">Ping</span>
          </div>

          {/* Map */}
          <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-2.5 overflow-hidden">
            <Map className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-bold text-foreground truncate max-w-full px-1">
              {online && status?.current_map ? status.current_map : "—"}
            </span>
            <span className="text-xs text-muted-foreground">Map</span>
          </div>
        </div>

        {/* Player occupancy bar */}
        {online && status && status.players_max > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Occupancy</span>
              <span>{Math.round((status.players_now / status.players_max) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (status.players_now / status.players_max) * 100)}%`,
                  background:
                    status.players_now / status.players_max > 0.9
                      ? "linear-gradient(90deg, #ff6644, #ff2244)"
                      : status.players_now / status.players_max > 0.6
                        ? "linear-gradient(90deg, #ffaa00, #ff8800)"
                        : "linear-gradient(90deg, #00ff88, #00d4ff)",
                }}
              />
            </div>
          </div>
        )}

        {/* Expanded chart */}
        {expanded && <PlayerChart serverId={server.id} />}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          {/* Expand chart */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
            {expanded ? "Hide chart" : "View chart"}
          </button>

          <div className="flex-1" />

          {/* RCON */}
          {server.game_type !== "fivem" && (
            <button
              onClick={() => setRconOpen(true)}
              title="RCON Console"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-green hover:bg-neon-green/10 transition-colors"
            >
              <Terminal className="w-4 h-4" />
            </button>
          )}

          {/* Auto-Join */}
          {online && (
            <a
              href={buildJoinLink(server.game_type, server.ip, server.port)}
              title="Play Now"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Play
            </a>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={() => {
                if (confirm(`Delete "${server.title}"?`)) onDelete(server.id);
              }}
              title="Delete server"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* RCON Modal */}
      {rconOpen && (
        <RconConsole
          serverId={server.id}
          serverTitle={server.title}
          apiKey={process.env.NEXT_PUBLIC_API_SECRET_KEY ?? ""}
          onClose={() => setRconOpen(false)}
        />
      )}
    </>
  );
}
