import type { Server, ServerPlayer, PlayerHistory, Stats, AuthResponse, User, NewsItem } from "@/types/server";

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
  // Servers
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

  // Players
  getServerPlayers: (id: number) =>
    fetchJSON<ServerPlayer[]>(`/api/v1/servers/${id}/players`),

  // Setup
  setupStatus: () => fetchJSON<{ needed: boolean }>("/api/v1/setup/status"),
  setupAdmin: (username: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/setup", { method: "POST", body: JSON.stringify({ username, password }) }),

  // Auth
  login:    (username: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/auth/login",    { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, email: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) }),

  // Admin - Users
  adminGetUsers: () => fetchJSON<User[]>("/api/v1/admin/users"),
  adminUpdateUser: (id: number, data: { role?: string; banned?: boolean }) =>
    fetchJSON<User>(`/api/v1/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteUser: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/admin/users/${id}`, { method: "DELETE" }),

  // News
  getNews: () => fetchJSON<NewsItem[]>("/api/v1/news"),
  createNews: (title: string, content: string) =>
    fetchJSON<NewsItem>("/api/v1/admin/news", { method: "POST", body: JSON.stringify({ title, content }) }),
  updateNews: (id: number, title: string, content: string) =>
    fetchJSON<NewsItem>(`/api/v1/admin/news/${id}`, { method: "PUT", body: JSON.stringify({ title, content }) }),
  deleteNews: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/admin/news/${id}`, { method: "DELETE" }),
};
