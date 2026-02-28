"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import type { VRisingMapData, VRisingPlayer, VRisingCastle } from "@/lib/api";

// Vardoran world bounds (approximate game coordinates)
const WORLD_MIN = -3400;
const WORLD_MAX = 3400;
const WORLD_RANGE = WORLD_MAX - WORLD_MIN;

function gameToSVG(gx: number, gz: number, svgW: number, svgH: number) {
  const x = ((gx - WORLD_MIN) / WORLD_RANGE) * svgW;
  const y = ((gz - WORLD_MIN) / WORLD_RANGE) * svgH; // Z → Y (top-down)
  return { x, y };
}

// Generate a deterministic color from a string (clan/owner)
function colorFromString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 60%)`;
}

interface TooltipState {
  x: number;
  y: number;
  content: string;
}

interface Props {
  serverId: number;
}

export default function VRisingMap({ serverId }: Props) {
  const { t, locale } = useLanguage();
  const [data, setData] = useState<VRisingMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const SVG_W = 600;
  const SVG_H = 600;

  const load = useCallback(async () => {
    try {
      const d = await api.getVRisingMap(serverId);
      setData(d);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const showTooltip = (e: React.MouseEvent, content: string) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left + 8, y: e.clientY - rect.top - 28, content });
  };

  const hideTooltip = () => setTooltip(null);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return locale === "ru" ? `${diffSec}с назад` : `${diffSec}s ago`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return locale === "ru" ? `${m}мин назад` : `${m}m ago`;
    return locale === "ru" ? `${Math.floor(m / 60)}ч назад` : `${Math.floor(m / 60)}h ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm animate-pulse">
        {t.chartLoading}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <span className="text-2xl">🗺️</span>
        <p className="text-sm text-center">{t.vRisingMapNoData}</p>
        <p className="text-xs opacity-60">POST /api/v1/vrising/push</p>
      </div>
    );
  }

  const players: VRisingPlayer[] = data.players ?? [];
  const castles: VRisingCastle[] = data.castles ?? [];

  return (
    <div className="flex flex-col gap-2">
      {/* Header stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            <span className="text-neon-green font-semibold">{players.length}</span>{" "}
            {t.vRisingMapPlayers}
          </span>
          <span>
            <span className="text-neon-purple font-semibold">{castles.length}</span>{" "}
            {t.vRisingMapCastles}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {data.stale_data && (
            <span className="text-yellow-400">⚠ {t.vRisingMapStale}</span>
          )}
          <span className="opacity-60">
            {t.vRisingMapUpdated} {formatTime(data.updated_at)}
          </span>
        </div>
      </div>

      {/* Map SVG */}
      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0d1117]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ display: "block", aspectRatio: "1/1" }}
          onMouseLeave={hideTooltip}
        >
          {/* Background gradient */}
          <defs>
            <radialGradient id="vr-bg" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#1a1f2e" />
              <stop offset="100%" stopColor="#0d1117" />
            </radialGradient>
            <filter id="vr-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={SVG_W} height={SVG_H} fill="url(#vr-bg)" />

          {/* Grid */}
          {Array.from({ length: 9 }).map((_, i) => {
            const step = SVG_W / 8;
            return (
              <g key={i} opacity="0.08">
                <line x1={step * i} y1={0} x2={step * i} y2={SVG_H} stroke="#ffffff" strokeWidth="1" />
                <line x1={0} y1={step * i} x2={SVG_W} y2={step * i} stroke="#ffffff" strokeWidth="1" />
              </g>
            );
          })}

          {/* Center crosshair */}
          <g opacity="0.15">
            <line x1={SVG_W / 2} y1={0} x2={SVG_W / 2} y2={SVG_H} stroke="#ffffff" strokeWidth="1" strokeDasharray="4 4" />
            <line x1={0} y1={SVG_H / 2} x2={SVG_W} y2={SVG_H / 2} stroke="#ffffff" strokeWidth="1" strokeDasharray="4 4" />
          </g>

          {/* Castles */}
          {castles.map((castle, i) => {
            const pos = gameToSVG(castle.x, castle.z, SVG_W, SVG_H);
            const col = colorFromString(castle.clan || castle.owner);
            const label = castle.clan || castle.owner;
            const tier = castle.tier ?? 1;
            const size = 6 + tier * 1.5;
            return (
              <g key={`c-${i}`}>
                {/* Glow ring */}
                <circle cx={pos.x} cy={pos.y} r={size + 4} fill={col} opacity="0.15" />
                {/* Castle diamond */}
                <rect
                  x={pos.x - size / 2}
                  y={pos.y - size / 2}
                  width={size}
                  height={size}
                  fill={col}
                  opacity="0.85"
                  rx="2"
                  transform={`rotate(45, ${pos.x}, ${pos.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseMove={(e) =>
                    showTooltip(
                      e,
                      `${t.vRisingMapCastle}: ${castle.name || label} | ${t.vRisingMapTier} ${tier}`
                    )
                  }
                  onMouseLeave={hideTooltip}
                />
              </g>
            );
          })}

          {/* Players */}
          {players.map((player, i) => {
            const pos = gameToSVG(player.x, player.z, SVG_W, SVG_H);
            const col = colorFromString(player.clan || player.name);
            return (
              <g key={`p-${i}`} filter="url(#vr-glow)">
                {/* Player dot */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={5}
                  fill={col}
                  opacity="0.95"
                  stroke="#0d1117"
                  strokeWidth="1"
                  style={{ cursor: "pointer" }}
                  onMouseMove={(e) =>
                    showTooltip(
                      e,
                      `${t.vRisingMapPlayer}: ${player.name}${player.clan ? ` [${player.clan}]` : ""}`
                    )
                  }
                  onMouseLeave={hideTooltip}
                />
                {/* Direction indicator (small triangle if we had velocity, skip for now) */}
              </g>
            );
          })}

          {/* Empty state label */}
          {players.length === 0 && castles.length === 0 && (
            <text
              x={SVG_W / 2}
              y={SVG_H / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#6b7280"
              fontSize="14"
            >
              {t.vRisingMapNoData}
            </text>
          )}

          {/* Legend */}
          <g opacity="0.7">
            <circle cx={12} cy={SVG_H - 26} r={4} fill="#00ff88" />
            <text x={20} y={SVG_H - 22} fill="#9ca3af" fontSize="10">{t.vRisingMapPlayer}</text>
            <rect x={8} y={SVG_H - 18} width={8} height={8} fill="#a855f7" rx="1" transform={`rotate(45, 12, ${SVG_H - 14})`} />
            <text x={20} y={SVG_H - 10} fill="#9ca3af" fontSize="10">{t.vRisingMapCastle}</text>
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 bg-black/90 text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/10 whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.content}
          </div>
        )}
      </div>
    </div>
  );
}
