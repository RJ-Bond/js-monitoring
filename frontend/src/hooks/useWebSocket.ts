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
  const retryCount = useRef(0);

  useEffect(() => {
    if (!WS_URL) return;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] connected");
        retryCount.current = 0;
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
        const delay = Math.min(30000, 1000 * Math.pow(2, retryCount.current));
        retryCount.current++;
        console.log(`[WS] disconnected, reconnecting in ${delay}ms… (attempt ${retryCount.current})`);
        reconnectTimer.current = setTimeout(connect, delay);
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
