"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { api } from "@/lib/api";
import type { VRisingMapData, VRisingPlayer, VRisingCastle } from "@/lib/api";

// ── Coordinate calibration ────────────────────────────────────────────────────
// V Rising world (Vardoran): X increases east, Z increases north.
// SVG Y increases downward → Z must be inverted.
// Bounds are loaded from admin settings (defaults match ScarletCore MAP_BOUNDS).

const SVG_SIZE = 800;

/** Deterministic HSL color from a string (clan/owner). */
function colorFromString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 80%, 62%)`;
}

interface TooltipState { x: number; y: number; content: string }

/** Convert game world coordinates to SVG pixel coordinates. */
function gameToSVG(
  gx: number, gz: number,
  xMin: number, xMax: number, zMin: number, zMax: number,
): { x: number; y: number } {
  const xRange = xMax - xMin;
  const zRange = zMax - zMin;
  const x = ((gx - xMin) / xRange) * SVG_SIZE;
  // Z is inverted: north (high Z) → top of SVG (low Y)
  const y = ((zMax - gz) / zRange) * SVG_SIZE;
  return { x, y };
}

export default function VRisingMap({ serverId }: { serverId: number }) {
  const { t, locale } = useLanguage();
  const {
    vRisingMapURL,
    vRisingWorldXMin,
    vRisingWorldXMax,
    vRisingWorldZMin,
    vRisingWorldZMax,
    vRisingCastleIconURL,
    vRisingPlayerIconURL,
  } = useSiteSettings();
  const MAP_IMAGE_URL = vRisingMapURL || "/vrising-map.png";

  const [data,       setData]       = useState<VRisingMapData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [mapLoaded,  setMapLoaded]  = useState(false);
  const [mapError,   setMapError]   = useState(false);
  const [tooltip,    setTooltip]    = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Pre-check whether the map image actually exists before SVG renders it,
  // so we can show the correct fallback state immediately.
  useEffect(() => {
    const img = new Image();
    img.onload  = () => setMapLoaded(true);
    img.onerror = () => setMapError(true);
    img.src = MAP_IMAGE_URL;
  }, []);

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
    setTooltip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 32, content });
  };
  const hideTooltip = () => setTooltip(null);

  const formatTime = (iso: string) => {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 60) return locale === "ru" ? `${diffSec}с назад` : `${diffSec}s ago`;
    const m = Math.floor(diffSec / 60);
    if (m < 60)       return locale === "ru" ? `${m}мин назад` : `${m}m ago`;
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
        <p className="text-xs opacity-50">POST /api/v1/vrising/push</p>
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
          {data.stale_data && <span className="text-yellow-400">⚠ {t.vRisingMapStale}</span>}
          <span className="opacity-50">{t.vRisingMapUpdated} {formatTime(data.updated_at)}</span>
        </div>
      </div>

      {/* Map image missing — show instructions */}
      {mapError && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-300/80 space-y-1">
          <p className="font-semibold">🗺️ {t.vRisingMapImageMissing}</p>
          <p className="opacity-70">{t.vRisingMapImageHint}</p>
          <code className="block opacity-60 font-mono mt-1">frontend/public/vrising-map.png</code>
          <p className="opacity-60 mt-1">{t.vRisingMapImageOr} <code>NEXT_PUBLIC_VRISING_MAP_URL</code></p>
        </div>
      )}

      {/* Map SVG */}
      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0d1117]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          width="100%"
          style={{ display: "block", aspectRatio: "1/1" }}
          onMouseLeave={hideTooltip}
        >
          <defs>
            {/* Fallback background gradient (visible when no map image) */}
            <radialGradient id="vr-bg" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#1a1f2e" />
              <stop offset="100%" stopColor="#0d1117" />
            </radialGradient>
            {/* Glow filter for player dots */}
            <filter id="vr-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Drop-shadow for castle icons on bright map areas */}
            <filter id="vr-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* ── Background ────────────────────────────────────────────── */}
          <rect width={SVG_SIZE} height={SVG_SIZE} fill="url(#vr-bg)" />

          {mapLoaded && (
            /* Real Vardoran map texture */
            <image
              href={MAP_IMAGE_URL}
              x={0} y={0}
              width={SVG_SIZE} height={SVG_SIZE}
              preserveAspectRatio="xMidYMid slice"
            />
          )}

          {!mapLoaded && !mapError && (
            /* Loading skeleton grid */
            <>
              {Array.from({ length: 9 }).map((_, i) => {
                const step = SVG_SIZE / 8;
                return (
                  <g key={i} opacity="0.06">
                    <line x1={step * i} y1={0} x2={step * i} y2={SVG_SIZE} stroke="#fff" strokeWidth="1" />
                    <line x1={0} y1={step * i} x2={SVG_SIZE} y2={step * i} stroke="#fff" strokeWidth="1" />
                  </g>
                );
              })}
            </>
          )}

          {mapLoaded && (
            /* Semi-transparent dark vignette so dots stay readable on bright terrain */
            <rect
              width={SVG_SIZE} height={SVG_SIZE}
              fill="rgba(0,0,0,0.18)"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* ── Castles ───────────────────────────────────────────────── */}
          {castles.map((castle, i) => {
            const { x, y } = gameToSVG(castle.x, castle.z, vRisingWorldXMin, vRisingWorldXMax, vRisingWorldZMin, vRisingWorldZMax);
            const col  = colorFromString(castle.clan || castle.owner);
            const tier = Math.max(1, castle.tier ?? 1);
            const size = 5 + tier * 1.8;
            const tooltip = `${t.vRisingMapCastle}: ${castle.name || castle.clan || castle.owner} · ${t.vRisingMapTier} ${tier}`;
            return (
              <g key={`c-${i}`} filter="url(#vr-shadow)"
                style={{ cursor: "pointer" }}
                onMouseMove={(e) => showTooltip(e, tooltip)}
                onMouseLeave={hideTooltip}
              >
                {vRisingCastleIconURL ? (
                  <image
                    href={vRisingCastleIconURL}
                    x={x - 12} y={y - 12}
                    width={24} height={24}
                  />
                ) : (
                  <>
                    {/* Glow halo */}
                    <circle cx={x} cy={y} r={size + 5} fill={col} opacity="0.2" />
                    {/* Diamond icon */}
                    <rect
                      x={x - size / 2} y={y - size / 2}
                      width={size} height={size}
                      fill={col} opacity="0.92" rx="1.5"
                      transform={`rotate(45,${x},${y})`}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* ── Players ───────────────────────────────────────────────── */}
          {players.map((player, i) => {
            const { x, y } = gameToSVG(player.x, player.z, vRisingWorldXMin, vRisingWorldXMax, vRisingWorldZMin, vRisingWorldZMax);
            const col = colorFromString(player.clan || player.name);
            const tooltip = `${t.vRisingMapPlayer}: ${player.name}${player.clan ? ` [${player.clan}]` : ""}`;
            return (
              <g key={`p-${i}`} filter="url(#vr-glow)"
                style={{ cursor: "pointer" }}
                onMouseMove={(e) => showTooltip(e, tooltip)}
                onMouseLeave={hideTooltip}
              >
                {vRisingPlayerIconURL ? (
                  <image
                    href={vRisingPlayerIconURL}
                    x={x - 10} y={y - 10}
                    width={20} height={20}
                  />
                ) : (
                  <>
                    {/* Outer ring */}
                    <circle cx={x} cy={y} r={7} fill={col} opacity="0.25" />
                    {/* Player dot */}
                    <circle
                      cx={x} cy={y} r={4.5}
                      fill={col} opacity="0.95"
                      stroke="#000" strokeWidth="1.2"
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Empty state */}
          {players.length === 0 && castles.length === 0 && (
            <text
              x={SVG_SIZE / 2} y={SVG_SIZE / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="#6b7280" fontSize="13"
            >
              {t.vRisingMapNoData}
            </text>
          )}

          {/* ── Legend ────────────────────────────────────────────────── */}
          <g>
            <rect x={6} y={SVG_SIZE - 42} width={90} height={38} rx="6"
              fill="rgba(0,0,0,0.55)" />
            <circle cx={18} cy={SVG_SIZE - 30} r={4} fill="#00e87a" />
            <text x={27} y={SVG_SIZE - 26} fill="#d1d5db" fontSize="9.5">{t.vRisingMapPlayer}</text>
            <rect x={14} y={SVG_SIZE - 20} width={8} height={8} fill="#c084fc" rx="1"
              transform={`rotate(45,18,${SVG_SIZE - 16})`} />
            <text x={27} y={SVG_SIZE - 12} fill="#d1d5db" fontSize="9.5">{t.vRisingMapCastle}</text>
          </g>

          {/* Cardinal directions (only when real map shown) */}
          {mapLoaded && (
            <g fill="#fff" fontSize="10" opacity="0.45" fontWeight="bold">
              <text x={SVG_SIZE / 2} y={14} textAnchor="middle">N</text>
              <text x={SVG_SIZE / 2} y={SVG_SIZE - 5} textAnchor="middle">S</text>
              <text x={8}            y={SVG_SIZE / 2 + 4}>W</text>
              <text x={SVG_SIZE - 8} y={SVG_SIZE / 2 + 4} textAnchor="end">E</text>
            </g>
          )}
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
