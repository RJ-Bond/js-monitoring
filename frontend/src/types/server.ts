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
  port: number;
  game_type: GameType;
  country_code?: string;
  country_name?: string;
  created_at: string;
  updated_at: string;
  status?: ServerStatus;
  alert_config?: AlertConfig;
}

export interface ServerPlayer {
  name: string;
}

export interface PlayerHistory {
  id: number;
  server_id: number;
  count: number;
  timestamp: string;
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
  role: "admin" | "user";
  banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
