"use client";

import { Server, Users, Activity } from "lucide-react";
import { useStats } from "@/hooks/useServers";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface StatCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  color: string;
  progress?: { current: number; max: number };
}

function StatCard({ icon, value, label, color, progress }: StatCardProps) {
  return (
    <div className="glass-card rounded-2xl px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className={cn("p-2.5 rounded-xl flex-shrink-0", color)}>{icon}</div>
        <div>
          <div className="text-2xl font-black tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        </div>
      </div>
      {progress && progress.max > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (progress.current / progress.max) * 100)}%`,
                background: "linear-gradient(90deg,#00ff88,#00d4ff)",
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground">{progress.current} / {progress.max}</div>
        </div>
      )}
    </div>
  );
}

export default function StatsOverview() {
  const { data } = useStats();
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard icon={<Server className="w-5 h-5 text-neon-blue" />} value={data?.total_servers ?? "—"} label={t.totalServers} color="bg-neon-blue/10" />
      <StatCard
        icon={<Activity className="w-5 h-5 text-neon-green" />}
        value={data?.online_servers ?? "—"}
        label={t.onlineNow}
        color="bg-neon-green/10"
        progress={data ? { current: data.online_servers, max: data.total_servers } : undefined}
      />
      <StatCard icon={<Users className="w-5 h-5 text-neon-purple" />} value={data?.total_players ?? "—"} label={t.totalPlayers} color="bg-neon-purple/10" />
    </div>
  );
}
