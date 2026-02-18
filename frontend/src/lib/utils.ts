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

// Генерация deep-link для игры
export function buildJoinLink(gameType: GameType, ip: string, port: number): string {
  switch (gameType) {
    case "minecraft":
      return `minecraft://?addExternalServer=Server|${ip}:${port}`;
    case "fivem":
      return `fivem://connect/${ip}:${port}`;
    case "source":
    default:
      return `steam://connect/${ip}:${port}`;
  }
}

export function gameTypeLabel(gameType: GameType): string {
  const labels: Record<GameType, string> = {
    source: "Source Engine",
    minecraft: "Minecraft",
    fivem: "FiveM / GTA V",
  };
  return labels[gameType] ?? gameType;
}

// Цвет нагрузки по заполненности
export function occupancyColor(now: number, max: number): string {
  if (max === 0) return "text-gray-400";
  const ratio = now / max;
  if (ratio >= 0.9) return "text-red-400";
  if (ratio >= 0.6) return "text-yellow-400";
  return "text-neon-green";
}
