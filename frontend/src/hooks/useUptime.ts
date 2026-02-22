"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useUptime(serverID: number) {
  return useQuery({
    queryKey: ["uptime", serverID],
    queryFn: () => api.getUptime(serverID),
    staleTime: 60_000,
    retry: false,
  });
}
