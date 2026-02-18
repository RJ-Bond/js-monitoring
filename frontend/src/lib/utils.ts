import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { GameType } from "@/types/server";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPlayers(now: number, max: number): string {
  return `${now} / ${max}`;
}

export function formatPing(ms: number): string {
  if (ms === 0) return "—";
  return `${ms} ms`;
}

export function formatLastUpdate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function buildJoinLink(gameType: GameType, ip: string, port: number): string {
  switch (gameType) {
    case "minecraft":
    case "minecraft_bedrock":
      return `minecraft://?addExternalServer=Server|${ip}:${port}`;
    case "fivem":
      return `fivem://connect/${ip}:${port}`;
    case "samp":
      return `samp://${ip}:${port}`;
    case "source":
    case "gmod":
    case "valheim":
    case "squad":
    case "dayz":
    default:
      return `steam://connect/${ip}:${port}`;
  }
}

export type GameMeta = {
  label: string;
  icon: string;
  defaultPort: number;
  protocol: string;
  steamAppId?: number; // Steam App ID for CDN icon
};

// Steam CDN capsule icon (120×45 px)
export function steamIconUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`;
}

export const GAME_META: Record<GameType, GameMeta> = {
  source:            { label: "Source Engine",     icon: "⚙️",  defaultPort: 27015, protocol: "source" },
  gmod:              { label: "Garry's Mod",       icon: "🔧", defaultPort: 27015, protocol: "source",     steamAppId: 4000 },
  valheim:           { label: "Valheim",           icon: "⚔️",  defaultPort: 2456,  protocol: "source",     steamAppId: 892970 },
  squad:             { label: "Squad",             icon: "🪖", defaultPort: 27165, protocol: "source",     steamAppId: 393380 },
  dayz:              { label: "DayZ",              icon: "🧟", defaultPort: 2302,  protocol: "source",     steamAppId: 221100 },
  vrising:           { label: "V Rising",          icon: "🧛", defaultPort: 27015, protocol: "source",     steamAppId: 1604030 },
  icarus:            { label: "Icarus",            icon: "🪐", defaultPort: 17777, protocol: "source",     steamAppId: 1149460 },
  minecraft:         { label: "Minecraft Java",    icon: "⛏️",  defaultPort: 25565, protocol: "minecraft" },
  minecraft_bedrock: { label: "Minecraft Bedrock", icon: "📦", defaultPort: 19132, protocol: "minecraft" },
  fivem:             { label: "FiveM / GTA V",     icon: "🚗", defaultPort: 30120, protocol: "fivem",      steamAppId: 271590 },
  samp:              { label: "SA-MP / open.mp",   icon: "🏙️",  defaultPort: 7777,  protocol: "samp",       steamAppId: 12120 },
  terraria:          { label: "Terraria",          icon: "🌳", defaultPort: 7777,  protocol: "terraria",   steamAppId: 105600 },
};

export function gameTypeLabel(gameType: GameType): string {
  return GAME_META[gameType]?.label ?? gameType;
}

export function gameTypeIcon(gameType: GameType): string {
  return GAME_META[gameType]?.icon ?? "🖥️";
}

export function gameTypeDefaultPort(gameType: GameType): number {
  return GAME_META[gameType]?.defaultPort ?? 27015;
}

export function occupancyColor(now: number, max: number): string {
  if (max === 0) return "text-gray-400";
  const ratio = now / max;
  if (ratio >= 0.9) return "text-red-400";
  if (ratio >= 0.6) return "text-yellow-400";
  return "text-neon-green";
}
