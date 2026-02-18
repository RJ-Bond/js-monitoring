import type { Server, PlayerHistory, Stats, AuthResponse } from "@/types/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("jsmon-token") ?? "";
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  getServers: () => fetchJSON<Server[]>("/api/v1/servers"),
  getServer:  (id: number) => fetchJSON<Server>(`/api/v1/servers/${id}`),
  getStats:   () => fetchJSON<Stats>("/api/v1/stats"),
  getHistory: (id: number, period: "24h" | "7d" | "30d" = "24h") =>
    fetchJSON<PlayerHistory[]>(`/api/v1/servers/${id}/history?period=${period}`),

  createServer: (data: Partial<Server>) =>
    fetchJSON<Server>("/api/v1/servers", { method: "POST", body: JSON.stringify(data) }),

  updateServer: (id: number, data: Partial<Server>) =>
    fetchJSON<Server>(`/api/v1/servers/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteServer: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/servers/${id}`, { method: "DELETE" }),

  // Auth
  login:    (username: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/auth/login",    { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, email: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) }),
};
