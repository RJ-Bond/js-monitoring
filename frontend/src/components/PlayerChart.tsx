"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useHistory } from "@/hooks/useServers";
import type { PlayerHistory } from "@/types/server";

type Period = "24h" | "7d" | "30d";

interface PlayerChartProps {
  serverId: number;
}

function formatTime(timestamp: string, period: Period): string {
  const d = new Date(timestamp);
  if (period === "24h") {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if (period === "7d") {
    return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function downsample(data: PlayerHistory[], maxPoints: number): PlayerHistory[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (active && payload?.length) {
    return (
      <div className="glass-card rounded-lg px-3 py-2 text-sm">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-neon-green font-semibold">{payload[0].value} players</p>
      </div>
    );
  }
  return null;
};

export default function PlayerChart({ serverId }: PlayerChartProps) {
  const [period, setPeriod] = useState<Period>("24h");
  const { data: rawHistory, isLoading } = useHistory(serverId, period);

  const history = downsample(rawHistory ?? [], 60);

  const chartData = history.map((h) => ({
    time: formatTime(h.timestamp, period),
    players: h.count,
  }));

  const periods: Period[] = ["24h", "7d", "30d"];

  return (
    <div className="flex flex-col gap-3">
      {/* Period switcher */}
      <div className="flex gap-1">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              period === p
                ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-28">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${serverId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="players"
                stroke="#00ff88"
                strokeWidth={2}
                fill={`url(#grad-${serverId})`}
                dot={false}
                activeDot={{ r: 4, fill: "#00ff88", stroke: "#00ff8844", strokeWidth: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
