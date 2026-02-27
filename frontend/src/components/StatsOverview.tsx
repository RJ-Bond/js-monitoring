"use client";

import { Server, Users, Activity } from "lucide-react";
import { useStats } from "@/hooks/useServers";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface StatCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  iconBg: string;
  iconRing: string;
  progress?: { current: number; max: number };
  gradient?: string;
}

function StatCard({ icon, value, label, iconBg, iconRing, progress, gradient }: StatCardProps) {
  return (
    <div className="glass-card rounded-2xl px-3 py-3 sm:px-5 sm:py-4 flex flex-col gap-2 sm:gap-3">
      <div className="flex items-center gap-2 sm:gap-4">
        <div className={cn("p-2 sm:p-3 rounded-xl sm:rounded-2xl flex-shrink-0 ring-1", iconBg, iconRing)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div
            className="text-xl sm:text-3xl font-black tabular-nums leading-none"
            style={gradient ? { background: gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : undefined}
          >
            {value}
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest mt-0.5 sm:mt-1 truncate">{label}</div>
        </div>
      </div>
      {progress && progress.max > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (progress.current / progress.max) * 100)}%`,
                background: "linear-gradient(90deg, #00ff88, #00d4ff)",
                boxShadow: "0 0 8px rgba(0,255,136,0.5)",
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground/70 tabular-nums">
            {progress.current} / {progress.max}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatsOverview() {
  const { data } = useStats();
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <StatCard
        icon={<Server className="w-5 h-5 text-neon-blue" />}
        value={data?.total_servers ?? "—"}
        label={t.totalServers}
        iconBg="bg-neon-blue/10"
        iconRing="ring-neon-blue/15"
        gradient="linear-gradient(135deg, #00d4ff, #a855f7)"
      />
      <StatCard
        icon={<Activity className="w-5 h-5 text-neon-green" />}
        value={data?.online_servers ?? "—"}
        label={t.onlineNow}
        iconBg="bg-neon-green/10"
        iconRing="ring-neon-green/15"
        gradient="linear-gradient(135deg, #00ff88, #00d4ff)"
        progress={data ? { current: data.online_servers, max: data.total_servers } : undefined}
      />
      <StatCard
        icon={<Users className="w-5 h-5 text-neon-purple" />}
        value={data?.total_players ?? "—"}
        label={t.totalPlayers}
        iconBg="bg-neon-purple/10"
        iconRing="ring-neon-purple/15"
        gradient="linear-gradient(135deg, #a855f7, #00d4ff)"
      />
    </div>
  );
}
