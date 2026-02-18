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
}

function StatCard({ icon, value, label, color }: StatCardProps) {
  return (
    <div className="glass-card rounded-2xl px-5 py-4 flex items-center gap-4">
      <div className={cn("p-2.5 rounded-xl", color)}>{icon}</div>
      <div>
        <div className="text-2xl font-black tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

export default function StatsOverview() {
  const { data } = useStats();
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard icon={<Server className="w-5 h-5 text-neon-blue" />} value={data?.total_servers ?? "—"} label={t.totalServers} color="bg-neon-blue/10" />
      <StatCard icon={<Activity className="w-5 h-5 text-neon-green" />} value={data?.online_servers ?? "—"} label={t.onlineNow} color="bg-neon-green/10" />
      <StatCard icon={<Users className="w-5 h-5 text-neon-purple" />} value={data?.total_players ?? "—"} label={t.totalPlayers} color="bg-neon-purple/10" />
    </div>
  );
}
