export interface ServerStatus {
  id: number;
  server_id: number;
  online_status: boolean;
  players_now: number;
  players_max: number;
  current_map: string;
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

export type GameType = "source" | "minecraft" | "fivem";

export interface Server {
  id: number;
  uuid: string;
  title: string;
  ip: string;
  port: number;
  game_type: GameType;
  created_at: string;
  updated_at: string;
  status?: ServerStatus;
  alert_config?: AlertConfig;
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
