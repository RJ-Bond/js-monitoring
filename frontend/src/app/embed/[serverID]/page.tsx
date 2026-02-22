"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import type { Server, PlayerHistory } from "@/types/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function fetchPublic<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  });
}

// Tiny SVG area chart — no external deps
function MiniPingChart({ data }: { data: { ping_ms: number; timestamp: string }[] }) {
  if (data.length < 2) return null;
  const W = 280, H = 60, PAD = 4;
  const values = data.map((d) => d.ping_ms).filter((v) => v > 0);
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = data
    .filter((d) => d.ping_ms > 0)
    .map((d, i, arr) => {
      const x = PAD + (i / (arr.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (d.ping_ms - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaClose = `${(W - PAD).toFixed(1)},${(H - PAD).toFixed(1)} ${PAD},${(H - PAD).toFixed(1)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${points} ${areaClose}`} fill="url(#pg)" />
      <polyline points={points} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function EmbedPage() {
  const params = useParams<{ serverID: string }>();
  const serverID = params.serverID;
  const [server, setServer] = useState<Server | null>(null);
  const [history, setHistory] = useState<PlayerHistory[]>([]);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [srv, hist] = await Promise.all([
        fetchPublic<Server>(`/api/v1/servers/${serverID}`),
        fetchPublic<PlayerHistory[]>(`/api/v1/servers/${serverID}/history?period=24h`),
      ]);
      setServer(srv);
      setHistory(hist);
    } catch { setError(true); }
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [serverID]);

  const online = server?.status?.online_status ?? false;
  const pingData = history.filter((h) => h.ping_ms && h.ping_ms > 0) as { ping_ms: number; timestamp: string }[];

  if (error) {
    return (
      <div style={{ fontFamily: "system-ui,sans-serif", padding: 12, fontSize: 13, color: "#888" }}>
        Server not found
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "system-ui,sans-serif",
      background: "hsl(220,25%,8%)",
      color: "#e2e8f0",
      borderRadius: 12,
      padding: "12px 14px",
      border: "1px solid rgba(255,255,255,0.08)",
      minHeight: 90,
      width: "100%",
      boxSizing: "border-box",
    }}>
      {!server ? (
        <div style={{ color: "#666", fontSize: 12 }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: online ? "#00ff88" : "#ff4444",
              boxShadow: online ? "0 0 6px #00ff88" : "0 0 6px #ff4444",
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {server.title || server.status?.server_name || server.ip}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#888", flexShrink: 0 }}>
              {server.ip}:{server.port}
            </span>
          </div>

          {online && server.status && (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
              <span>👥 {server.status.players_now}/{server.status.players_max}</span>
              {server.status.ping_ms > 0 && <span>📶 {server.status.ping_ms}ms</span>}
              {server.status.current_map && <span>🗺 {server.status.current_map}</span>}
            </div>
          )}

          {pingData.length >= 2 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Ping (ms)</div>
              <MiniPingChart data={pingData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
