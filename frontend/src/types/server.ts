export interface ServerStatus {
  id: number;
  server_id: number;
  online_status: boolean;
  players_now: number;
  players_max: number;
  current_map: string;
  server_name?: string;
  ping_ms: number;
  last_update: string;
}

export interface AlertConfig {
  id: number;
  server_id: number;
  threshold_cpu: number;
  offline_timeout: number;
  tg_chat_id: string;
  enabled: boolean;
  notify_online: boolean;
  email_to: string;
}

export type GameType =
  | "source"
  | "minecraft"
  | "minecraft_bedrock"
  | "fivem"
  | "samp"
  | "valheim"
  | "terraria"
  | "dayz"
  | "squad"
  | "gmod"
  | "vrising"
  | "icarus";

export interface Server {
  id: number;
  uuid: string;
  title: string;
  ip: string;
  display_ip?: string;
  port: number;
  game_type: GameType;
  country_code?: string;
  country_name?: string;
  owner_id?: number;
  created_at: string;
  updated_at: string;
  status?: ServerStatus;
  alert_config?: AlertConfig;
}

export interface NewsItem {
  id: number;
  title: string;
  content: string;
  author_id: number;
  author_name?: string;
  author_avatar?: string;
  image_url?: string;
  tags?: string;
  pinned: boolean;
  published: boolean;
  publish_at?: string | null;
  views: number;
  created_at: string;
  updated_at: string;
}

export function parseTags(item: NewsItem): string[] {
  return item.tags?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
}

export interface ServerPlayer {
  name: string;
}

export interface PlayerHistory {
  id: number;
  server_id: number;
  count: number;
  ping_ms?: number;
  timestamp: string;
}

export interface UserSession {
  id: number;
  user_id: number;
  jti: string;
  user_agent: string;
  ip: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
}

export interface LeaderboardEntry {
  player_name: string;
  total_seconds: number;
  sessions: number;
  last_seen: string | null;
}

export interface Stats {
  total_servers: number;
  online_servers: number;
  total_players: number;
}

export interface WSMessage {
  type: "status_update";
  server_id: number;
  status: ServerStatus;
}

// Auth types
export interface User {
  id: number;
  username: string;
  email: string;
  steam_id?: string;
  avatar?: string;
  api_token?: string;
  role: "admin" | "user";
  banned: boolean;
  created_at: string;
  updated_at: string;
  server_count?: number;
}

export interface AdminServer extends Server {
  owner_name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface UptimeData {
  uptime_24h: number;
  total: number;
  online: number;
}

export interface GlobalLeaderboardEntry {
  rank: number;
  player_name: string;
  total_seconds: number;
  servers_count: number;
  last_seen: string | null;
}

export interface PlayerProfileServer {
  server_id: number;
  server_name: string;
  total_seconds: number;
  last_seen: string | null;
}

export interface PlayerProfile {
  player_name: string;
  total_seconds: number;
  last_seen: string | null;
  servers: PlayerProfileServer[];
}

export interface AuditLogEntry {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: number;
  details: string;
  created_at: string;
}

export interface AuditPage {
  items: AuditLogEntry[];
  total: number;
}

export interface DiscordConfig {
  id: number;
  server_id: number;
  enabled: boolean;
  webhook_url: string;
  message_id: string;
  update_interval: number;
}
