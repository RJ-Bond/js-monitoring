import type { Server, PlayerHistory, Stats } from "@/types/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  getServers: () => fetchJSON<Server[]>("/api/v1/servers"),
  getServer: (id: number) => fetchJSON<Server>(`/api/v1/servers/${id}`),
  getStats: () => fetchJSON<Stats>("/api/v1/stats"),
  getHistory: (id: number, period: "24h" | "7d" | "30d" = "24h") =>
    fetchJSON<PlayerHistory[]>(`/api/v1/servers/${id}/history?period=${period}`),

  createServer: async (data: Partial<Server>): Promise<Server> => {
    const res = await fetch(`${BASE}/api/v1/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create server");
    return res.json();
  },

  deleteServer: async (id: number): Promise<void> => {
    await fetch(`${BASE}/api/v1/servers/${id}`, { method: "DELETE" });
  },
};
