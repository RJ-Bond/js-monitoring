import type { Server, ServerPlayer, PlayerHistory, LeaderboardEntry, Stats, AuthResponse, User, NewsItem, AdminServer, UptimeData, GlobalLeaderboardEntry, PlayerProfile, AuditPage, AlertConfig, DiscordConfig, UserSession } from "@/types/server";

export interface NewsPage {
  items: NewsItem[];
  total: number;
}

export interface NewsFormData {
  title: string;
  content: string;
  image_url?: string;
  tags?: string;
  pinned?: boolean;
  published?: boolean;
  publish_at?: string | null;
  send_to_discord?: boolean;
  send_to_telegram?: boolean;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("jsmon-token") ?? sessionStorage.getItem("jsmon-token") ?? "";
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
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface SiteSettings {
  id: number;
  site_name: string;
  logo_data: string;
  steam_enabled: boolean;
  app_url: string;
  registration_enabled: boolean;
  force_https: boolean;
  default_theme: "dark" | "light" | "system";
}

export interface AdminSiteSettings {
  id: number;
  site_name: string;
  logo_data: string;
  app_url: string;
  steam_key_set: boolean;
  steam_key_hint: string;
  steam_key_source: "db" | "env";
  registration_enabled: boolean;
  news_webhook_url: string;
  news_role_id: string;
  news_tg_bot_token: string;
  news_tg_chat_id: string;
  news_tg_thread_id: string;
  ssl_mode: string;
  ssl_domain: string;
  force_https: boolean;
  default_theme: "dark" | "light" | "system";
  discord_app_id?: string;
  discord_bot_token_set?: boolean;
  discord_proxy?: string;
}

export interface SSLStatus {
  mode: string;
  domain: string;
  force_https: boolean;
  expires_at?: string;
  days_remaining?: number;
  issuer?: string;
  certbot_logs?: string[];
}

export interface PublicProfile {
  id: number;
  username: string;
  avatar: string;
  role: string;
  created_at: string;
  servers: Server[];
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
  getLeaderboard: (id: number, period: "7d" | "30d" | "all" = "7d") =>
    fetchJSON<LeaderboardEntry[]>(`/api/v1/servers/${id}/leaderboard?period=${period}`),

  // Setup
  setupStatus: () => fetchJSON<{ needed: boolean }>("/api/v1/setup/status"),
  setupAdmin: (username: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/setup", { method: "POST", body: JSON.stringify({ username, password }) }),

  // Auth
  login:    (username: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/auth/login",    { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, email: string, password: string) =>
    fetchJSON<AuthResponse>("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) }),

  // Admin - News
  getAdminNews: () => fetchJSON<NewsPage>("/api/v1/admin/news"),

  // Admin - Users
  adminGetUsers: () => fetchJSON<User[]>("/api/v1/admin/users"),
  adminGetServers: () => fetchJSON<AdminServer[]>("/api/v1/admin/servers"),
  adminUpdateUser: (id: number, data: { role?: string; banned?: boolean }) =>
    fetchJSON<User>(`/api/v1/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteUser: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/admin/users/${id}`, { method: "DELETE" }),

  // Profile
  getProfile: () => fetchJSON<User>("/api/v1/profile"),
  updateProfile: (data: { username?: string; email?: string; current_password?: string; new_password?: string }) =>
    fetchJSON<User>("/api/v1/profile", { method: "PUT", body: JSON.stringify(data) }),
  updateAvatar: (avatar: string) =>
    fetchJSON<User>("/api/v1/profile/avatar", { method: "PUT", body: JSON.stringify({ avatar }) }),
  generateToken: () =>
    fetchJSON<User>("/api/v1/profile/token", { method: "POST" }),
  deleteProfile: () =>
    fetchJSON<User>("/api/v1/profile", { method: "DELETE" }),
  cancelDeleteProfile: () =>
    fetchJSON<User>("/api/v1/profile/delete-cancel", { method: "POST" }),
  getProfileServers: () =>
    fetchJSON<Server[]>("/api/v1/profile/servers"),

  // Site settings
  getSettings: () => fetchJSON<SiteSettings>("/api/v1/settings"),
  getAdminSettings: () => fetchJSON<AdminSiteSettings>("/api/v1/admin/settings"),
  updateSettings: (data: { site_name?: string; logo_data?: string; app_url?: string; steam_api_key?: string }) =>
    fetchJSON<SiteSettings>("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Public profile
  getPublicProfile: (username: string) =>
    fetchJSON<PublicProfile>(`/api/v1/users/${username}`),

  // News
  getNews: (params?: { page?: number; search?: string; tag?: string }) => {
    const p = new URLSearchParams();
    if (params?.page && params.page > 1) p.set("page", String(params.page));
    if (params?.search) p.set("search", params.search);
    if (params?.tag) p.set("tag", params.tag);
    const qs = p.toString() ? `?${p.toString()}` : "";
    return fetchJSON<NewsPage>(`/api/v1/news${qs}`);
  },
  createNews: (data: NewsFormData) =>
    fetchJSON<NewsItem>("/api/v1/admin/news", { method: "POST", body: JSON.stringify(data) }),
  updateNews: (id: number, data: NewsFormData) =>
    fetchJSON<NewsItem>(`/api/v1/admin/news/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteNews: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/admin/news/${id}`, { method: "DELETE" }),
  trackView: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/news/${id}/view`, { method: "POST" }),

  // Uptime
  getUptime: (serverID: number) =>
    fetchJSON<UptimeData>(`/api/v1/servers/${serverID}/uptime`),

  // Global leaderboard
  getGlobalLeaderboard: () =>
    fetchJSON<GlobalLeaderboardEntry[]>("/api/v1/leaderboard"),

  // Player profile
  getPlayerProfile: (name: string) =>
    fetchJSON<PlayerProfile>(`/api/v1/players/${encodeURIComponent(name)}`),

  // Alerts config (admin)
  getAlertConfig: (serverID: number) =>
    fetchJSON<AlertConfig>(`/api/v1/admin/alerts/${serverID}`),
  updateAlertConfig: (serverID: number, data: { enabled: boolean; tg_chat_id: string; offline_timeout: number; notify_online?: boolean; email_to?: string }) =>
    fetchJSON<AlertConfig>(`/api/v1/admin/alerts/${serverID}`, { method: "PUT", body: JSON.stringify(data) }),

  // Password reset (admin)
  generateResetToken: (userID: number) =>
    fetchJSON<{ link: string; expires_at: string }>(`/api/v1/admin/users/${userID}/reset-token`, { method: "POST" }),
  resetPassword: (token: string, password: string): Promise<void> =>
    fetchJSON<void>("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  // Audit log (admin)
  getAuditLog: (params?: { page?: number; entity_type?: string }) => {
    const p = new URLSearchParams();
    if (params?.page && params.page > 1) p.set("page", String(params.page));
    if (params?.entity_type) p.set("entity_type", params.entity_type);
    const qs = p.toString() ? `?${p.toString()}` : "";
    return fetchJSON<AuditPage>(`/api/v1/admin/audit${qs}`);
  },

  // Discord integration (admin)
  getDiscordConfig: (serverID: number) =>
    fetchJSON<DiscordConfig>(`/api/v1/admin/discord/${serverID}`),
  updateDiscordConfig: (serverID: number, data: { enabled: boolean; webhook_url: string; update_interval: number }) =>
    fetchJSON<DiscordConfig>(`/api/v1/admin/discord/${serverID}`, { method: "PUT", body: JSON.stringify(data) }),
  testDiscordConfig: (serverID: number): Promise<{ ok: boolean; message_id: string }> =>
    fetchJSON(`/api/v1/admin/discord/${serverID}/test`, { method: "POST" }),

  // Sessions
  getSessions: () => fetchJSON<UserSession[]>("/api/v1/profile/sessions"),
  deleteSession: (id: number): Promise<void> =>
    fetchJSON<void>(`/api/v1/profile/sessions/${id}`, { method: "DELETE" }),
  deleteAllSessions: (): Promise<{ token: string }> =>
    fetchJSON<{ token: string }>("/api/v1/profile/sessions", { method: "DELETE" }),

  // 2FA / TOTP
  generateTOTP: (): Promise<{ secret: string; qr_url: string; otp_url: string }> =>
    fetchJSON("/api/v1/profile/totp"),
  enableTOTP: (code: string): Promise<{ ok: boolean }> =>
    fetchJSON("/api/v1/profile/totp/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disableTOTP: (code: string): Promise<{ ok: boolean }> =>
    fetchJSON("/api/v1/profile/totp", { method: "DELETE", body: JSON.stringify({ code }) }),
  verify2FA: (temp_token: string, code: string): Promise<{ token: string; user: User }> =>
    fetchJSON("/api/v1/auth/2fa", { method: "POST", body: JSON.stringify({ temp_token, code }) }),

  // CSV export (admin)
  exportServersUrl: () => `${BASE}/api/v1/admin/export/servers.csv`,
  exportPlayersUrl: () => `${BASE}/api/v1/admin/export/players.csv`,
  exportAuditUrl:   () => `${BASE}/api/v1/admin/export/audit.csv`,

  // Bulk operations (admin)
  bulkUsers: (action: string, ids: number[]): Promise<{ ok: boolean; count: number }> =>
    fetchJSON("/api/v1/admin/users/bulk", { method: "POST", body: JSON.stringify({ action, ids }) }),
  bulkServers: (action: string, ids: number[]): Promise<{ ok: boolean; count: number }> =>
    fetchJSON("/api/v1/admin/servers/bulk", { method: "POST", body: JSON.stringify({ action, ids }) }),

  // Update settings with registration_enabled and news webhook
  updateSettingsFull: (data: { site_name?: string; logo_data?: string; app_url?: string; steam_api_key?: string; registration_enabled?: boolean; news_webhook_url?: string; news_role_id?: string; news_tg_bot_token?: string; news_tg_chat_id?: string; news_tg_thread_id?: string; force_https?: boolean; default_theme?: string; discord_bot_token?: string; discord_app_id?: string; discord_proxy?: string }) =>
    fetchJSON<SiteSettings>("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify(data) }),

  testNewsWebhook: () => fetchJSON<{ ok: boolean }>("/api/v1/admin/news/webhook/test", { method: "POST" }),
  testTelegramWebhook: () => fetchJSON<{ ok: boolean }>("/api/v1/admin/news/telegram/test", { method: "POST" }),
  getSSLStatus: () => fetchJSON<SSLStatus>("/api/v1/admin/ssl/status"),
};
