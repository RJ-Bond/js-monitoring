"use client";

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { useLeaderboard } from "@/hooks/useServers";
import { useLanguage } from "@/contexts/LanguageContext";

type Period = "7d" | "30d" | "all";

const MEDAL_COLORS = [
  "#f59e0b", // 🥇 gold
  "#94a3b8", // 🥈 silver
  "#c2713c", // 🥉 bronze
];
const DEFAULT_COLOR = "#00d4ff";

function formatDuration(seconds: number, locale: string): string {
  if (seconds < 60) return locale === "ru" ? `${seconds}с` : `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return locale === "ru" ? `${m}м` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return locale === "ru" ? `${h}ч` : `${h}h`;
  return locale === "ru" ? `${h}ч ${rem}м` : `${h}h ${rem}m`;
}

interface PlayerLeaderboardProps {
  serverId: number;
}

export default function PlayerLeaderboard({ serverId }: PlayerLeaderboardProps) {
  const [period, setPeriod] = useState<Period>("7d");
  const { data, isLoading } = useLeaderboard(serverId, period);
  const { t, locale } = useLanguage();

  const chartData = (data ?? []).map((e, i) => ({
    name: `#${i + 1} ${e.player_name}`,
    displayName: e.player_name,
    rank: i + 1,
    hours: parseFloat((e.total_seconds / 3600).toFixed(2)),
    total_seconds: e.total_seconds,
    sessions: e.sessions,
  }));

  const periodLabels: Record<Period, string> = {
    "7d":  locale === "ru" ? "7д"  : "7d",
    "30d": locale === "ru" ? "30д" : "30d",
    "all": locale === "ru" ? "Всё" : "All",
  };

  const chartHeight = Math.max(100, chartData.length * 28);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {(["7d", "30d", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              period === p
                ? "bg-neon-blue/20 text-neon-blue border border-neon-blue/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      <div style={{ height: chartHeight }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {t.chartLoading}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs text-center px-4">
            {t.leaderboardNoData}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}h`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof chartData[0];
                  const medal = d.rank === 1 ? "🥇" : d.rank === 2 ? "🥈" : d.rank === 3 ? "🥉" : `#${d.rank}`;
                  return (
                    <div className="chart-tooltip rounded-lg px-3 py-2 text-sm">
                      <p className="font-semibold text-foreground truncate max-w-[160px]">
                        {medal} {d.displayName}
                      </p>
                      <p className="text-neon-green font-mono">{formatDuration(d.total_seconds, locale)}</p>
                      <p className="text-muted-foreground text-xs">
                        {d.sessions} {t.leaderboardSessions}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="hours"
                radius={[0, 4, 4, 0]}
                maxBarSize={18}
                label={{
                  position: "right",
                  formatter: (v: number) => v >= 0.1 ? `${v}h` : "",
                  fill: "#64748b",
                  fontSize: 9,
                }}
              >
                {chartData.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={i < 3 ? MEDAL_COLORS[i] : DEFAULT_COLOR}
                    fillOpacity={i < 3 ? 0.85 : 0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
