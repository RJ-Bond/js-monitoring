"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WSMessage } from "@/types/server";

const WS_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.host}/api/v1/ws`)
    : "";

export function useServerWebSocket() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!WS_URL) return;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data as string);
          if (msg.type === "status_update") {
            // Обновляем кеш React Query без рефетча
            qc.setQueryData<import("@/types/server").Server[]>(["servers"], (prev) => {
              if (!prev) return prev;
              return prev.map((srv) =>
                srv.id === msg.server_id ? { ...srv, status: msg.status } : srv
              );
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        console.log("[WS] disconnected, reconnecting in 5s…");
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [qc]);
}
