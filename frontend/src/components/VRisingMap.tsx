"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Maximize2, Minimize2, UserX, Swords, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { VRisingMapData, VRisingPlayer, VRisingCastle, VRisingFreePlot } from "@/lib/api";

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

interface ModTarget { player: VRisingPlayer; mode: "kick" | "ban" }

/** Parse duration string like "1h", "2d", "0" (permanent) → seconds (0 = permanent) */
function parseDuration(s: string): number {
  const t = s.trim().toLowerCase();
  if (t === "0" || t === "" || t === "permanent") return 0;
  const m = t.match(/^(\d+)([hd])$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * (m[2] === "h" ? 3600 : 86400);
}

export default function VRisingMap({ serverId }: { serverId: number }) {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
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

  const [data,        setData]        = useState<VRisingMapData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [mapLoaded,   setMapLoaded]   = useState(false);
  const [mapError,    setMapError]    = useState(false);
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modTarget,   setModTarget]   = useState<ModTarget | null>(null);
  const [modReason,   setModReason]   = useState("");
  const [modDuration, setModDuration] = useState("0");
  const [modLoading,  setModLoading]  = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

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

  // Sync React state with browser fullscreen changes (Escape key, F11, etc.)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const showTooltip = (e: React.MouseEvent, content: string) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 32, content });
  };
  const hideTooltip = () => setTooltip(null);

  const openMod = (player: VRisingPlayer, mode: "kick" | "ban") => {
    setModTarget({ player, mode });
    setModReason("");
    setModDuration("0");
  };

  const closeMod = () => {
    if (!modLoading) setModTarget(null);
  };

  const executeModCommand = async () => {
    if (!modTarget) return;
    setModLoading(true);
    try {
      const durSeconds = modTarget.mode === "ban"
        ? parseDuration(modDuration)
        : 0;
      await api.queueModCommand(serverId, {
        type: modTarget.mode,
        player_name: modTarget.player.name,
        reason: modReason || undefined,
        duration_seconds: durSeconds,
      });
      toast(`${modTarget.mode === "kick" ? "Kick" : "Ban"} queued for ${modTarget.player.name}`);
      setModTarget(null);
    } catch {
      toast("Failed to queue command", "error");
    } finally {
      setModLoading(false);
    }
  };

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

  const players:   VRisingPlayer[]   = data.players    ?? [];
  const castles:   VRisingCastle[]   = data.castles    ?? [];
  const freePlots: VRisingFreePlot[] = data.free_plots ?? [];

  // In fullscreen the browser makes containerRef fill 100vw × 100vh.
  // Constrain the map to a square fitting within the viewport height.
  const fsMapSize = "min(calc(100vh - 52px), calc(100vw - 32px))";

  return (
    <>
    <div
      ref={containerRef}
      style={isFullscreen ? {
        background: "#0d1117",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "10px 16px",
      } : {}}
    >
      <div
        className="flex flex-col gap-2"
        style={isFullscreen ? { width: fsMapSize } : undefined}
      >
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
            <span>
              <span className="text-yellow-400 font-semibold">{freePlots.length}</span>{" "}
              {t.vRisingMapFreePlots}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {data.stale_data && <span className="text-yellow-400">⚠ {t.vRisingMapStale}</span>}
            <span className="opacity-50">{t.vRisingMapUpdated} {formatTime(data.updated_at)}</span>
            <button
              onClick={toggleFullscreen}
              className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              title={isFullscreen ? t.vRisingMapExitFullscreen : t.vRisingMapFullscreen}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
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
            style={{ display: "block", aspectRatio: "1/1", cursor: isFullscreen ? "default" : "zoom-in" }}
            onMouseLeave={hideTooltip}
            onDoubleClick={toggleFullscreen}
          >
            <defs>
              <radialGradient id="vr-bg" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#1a1f2e" />
                <stop offset="100%" stopColor="#0d1117" />
              </radialGradient>
              <filter id="vr-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="vr-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#000" floodOpacity="0.8" />
              </filter>
            </defs>

            {/* ── Background ──────────────────────────────────────────── */}
            <rect width={SVG_SIZE} height={SVG_SIZE} fill="url(#vr-bg)" />

            {mapLoaded && (
              <image
                href={MAP_IMAGE_URL}
                x={0} y={0}
                width={SVG_SIZE} height={SVG_SIZE}
                preserveAspectRatio="xMidYMid slice"
              />
            )}

            {!mapLoaded && !mapError && (
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
              <rect
                width={SVG_SIZE} height={SVG_SIZE}
                fill="rgba(0,0,0,0.18)"
                style={{ pointerEvents: "none" }}
              />
            )}


            {/* ── Castles ───────────────────────────────────────────── */}
            {castles.map((castle, i) => {
              const { x, y } = gameToSVG(castle.x, castle.z, vRisingWorldXMin, vRisingWorldXMax, vRisingWorldZMin, vRisingWorldZMax);
              const col  = colorFromString(castle.clan || castle.owner);
              const tier = Math.max(1, castle.tier ?? 1);
              const size = 5 + tier * 1.8;
              const tip  = `${t.vRisingMapCastle}: ${castle.name || castle.clan || castle.owner} · ${t.vRisingMapTier} ${tier}`;
              return (
                <g key={`c-${i}`} filter="url(#vr-shadow)"
                  style={{ cursor: "pointer" }}
                  onMouseMove={(e) => showTooltip(e, tip)}
                  onMouseLeave={hideTooltip}
                >
                  {vRisingCastleIconURL ? (
                    <image href={vRisingCastleIconURL} x={x - 12} y={y - 12} width={24} height={24} />
                  ) : (
                    <>
                      <circle cx={x} cy={y} r={size + 5} fill={col} opacity="0.2" />
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

            {/* ── Players ───────────────────────────────────────────── */}
            {players.map((player, i) => {
              const { x, y } = gameToSVG(player.x, player.z, vRisingWorldXMin, vRisingWorldXMax, vRisingWorldZMin, vRisingWorldZMax);
              const col = colorFromString(player.clan || player.name);
              const tip = `${t.vRisingMapPlayer}: ${player.name}${player.clan ? ` [${player.clan}]` : ""}`;
              return (
                <g key={`p-${i}`} filter="url(#vr-glow)"
                  style={{ cursor: "pointer" }}
                  onMouseMove={(e) => showTooltip(e, tip)}
                  onMouseLeave={hideTooltip}
                >
                  {vRisingPlayerIconURL ? (
                    <image href={vRisingPlayerIconURL} x={x - 10} y={y - 10} width={20} height={20} />
                  ) : (
                    <>
                      <circle cx={x} cy={y} r={7} fill={col} opacity="0.25" />
                      <circle cx={x} cy={y} r={4.5} fill={col} opacity="0.95" stroke="#000" strokeWidth="1.2" />
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

            {/* ── Legend ────────────────────────────────────────────── */}
            <g>
              <rect x={6} y={SVG_SIZE - 40} width={110} height={36} rx="6" fill="rgba(0,0,0,0.55)" />
              <circle cx={18} cy={SVG_SIZE - 28} r={4} fill="#00e87a" />
              <text x={27} y={SVG_SIZE - 24} fill="#d1d5db" fontSize="9.5">{t.vRisingMapPlayer}</text>
              <rect x={14} y={SVG_SIZE - 18} width={8} height={8} fill="#c084fc" rx="1"
                transform={`rotate(45,18,${SVG_SIZE - 14})`} />
              <text x={27} y={SVG_SIZE - 10} fill="#d1d5db" fontSize="9.5">{t.vRisingMapCastle}</text>
            </g>

            {/* Cardinal directions */}
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

        {/* Admin: online player list with kick/ban buttons */}
        {isAdmin && players.length > 0 && (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="bg-white/5 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-2">
              <Swords size={11} />
              Online Players — Admin Actions
            </div>
            <div className="divide-y divide-white/5">
              {players.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-white/3 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.clan && <span className="text-xs text-muted-foreground">[{p.clan}]</span>}
                    {p.is_admin && <span className="text-xs text-yellow-400">admin</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openMod(p, "kick")}
                      className="px-2 py-0.5 rounded text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-colors"
                    >
                      Kick
                    </button>
                    <button
                      onClick={() => openMod(p, "ban")}
                      className="px-2 py-0.5 rounded text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      Ban
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Moderation modal */}
    {modTarget !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              {modTarget.mode === "kick"
                ? <><Swords size={16} className="text-yellow-400" /> Kick Player</>
                : <><UserX size={16} className="text-red-400" /> Ban Player</>
              }
            </h2>
            <button onClick={closeMod} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          </div>

          <p className="text-sm text-muted-foreground">
            Player: <span className="text-foreground font-semibold">{modTarget.player.name}</span>
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Reason (optional)</label>
              <input
                type="text"
                value={modReason}
                onChange={e => setModReason(e.target.value)}
                placeholder="e.g. cheating"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 transition-colors"
              />
            </div>
            {modTarget.mode === "ban" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Duration (0 = permanent, e.g. 1h, 7d)</label>
                <input
                  type="text"
                  value={modDuration}
                  onChange={e => setModDuration(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 transition-colors"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={closeMod}
              disabled={modLoading}
              className="px-4 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={executeModCommand}
              disabled={modLoading}
              className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                modTarget.mode === "kick"
                  ? "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400"
                  : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
              }`}
            >
              {modLoading ? "Sending..." : modTarget.mode === "kick" ? "Kick" : "Ban"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
