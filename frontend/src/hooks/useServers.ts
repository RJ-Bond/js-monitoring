"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Server } from "@/types/server";

export function useServers() {
  return useQuery({
    queryKey: ["servers"],
    queryFn: api.getServers,
    refetchInterval: 30_000, // fallback polling если WS недоступен
    staleTime: 10_000,
  });
}

export function useServer(id: number) {
  return useQuery({
    queryKey: ["servers", id],
    queryFn: () => api.getServer(id),
    staleTime: 10_000,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: api.getStats,
    refetchInterval: 15_000,
  });
}

export function useHistory(id: number, period: "24h" | "7d" | "30d" = "24h") {
  return useQuery({
    queryKey: ["history", id, period],
    queryFn: () => api.getHistory(id, period),
    staleTime: 60_000,
  });
}

export function useCreateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Server>) => api.createServer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
}
