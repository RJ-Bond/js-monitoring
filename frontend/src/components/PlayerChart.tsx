"use client";

import { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { useHistory } from "@/hooks/useServers";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PlayerHistory } from "@/types/server";

type Period = "24h" | "7d" | "30d";

interface PlayerChartProps {
  serverId: number;
}

function formatTime(timestamp: string, period: Period, locale: string): string {
  const d = new Date(timestamp);
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  if (period === "24h") return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  if (period === "7d") return d.toLocaleDateString(loc, { weekday: "short", day: "numeric" });
  return d.toLocaleDateString(loc, { day: "numeric", month: "short" });
}

function downsample(data: PlayerHistory[], maxPoints: number): PlayerHistory[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}

function makeTooltip(locale: string) {
  const isRu = locale === "ru";
  return function CustomTooltip({
    active, payload, label,
  }: {
    active?: boolean;
    payload?: { name?: string; value?: number; color?: string }[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    const players = payload.find((p) => p.name === "players");
    const ping = payload.find((p) => p.name === "ping");
    return (
      <div className="chart-tooltip rounded-xl px-3 py-2.5 text-xs shadow-2xl min-w-[110px]">
        <p className="text-muted-foreground/70 font-mono text-[10px] mb-2 border-b border-white/10 pb-1.5">{label}</p>
        {players && (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-green flex-shrink-0" />
              {isRu ? "Игрок" : "Players"}
            </span>
            <span className="font-bold text-neon-green tabular-nums">{players.value}</span>
          </div>
        )}
        {ping && (ping.value ?? 0) > 0 && (
          <div className="flex items-center justify-between gap-3 mt-1">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-blue flex-shrink-0" />
              {isRu ? "Пинг" : "Ping"}
            </span>
            <span className="font-bold text-neon-blue tabular-nums">{ping.value} ms</span>
          </div>
        )}
      </div>
    );
  };
}

export default function PlayerChart({ serverId }: PlayerChartProps) {
  const [period, setPeriod] = useState<Period>("24h");
  const { data: rawHistory, isLoading } = useHistory(serverId, period);
  const { t, locale } = useLanguage();

  const history = downsample(rawHistory ?? [], 60);
  const chartData = history.map((h) => ({
    time: formatTime(h.timestamp, period, locale),
    players: h.count,
    ping: h.ping_ms ?? 0,
  }));

  const peak = chartData.length > 0 ? Math.max(...chartData.map((d) => d.players)) : 0;
  const avg = chartData.length > 0
    ? Math.round(chartData.reduce((s, d) => s + d.players, 0) / chartData.length)
    : 0;

  const hasPing = chartData.some((d) => d.ping > 0);
  const isRu = locale === "ru";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["24h", "7d", "30d"] as Period[]).map((p) => (
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
        <div className="flex items-center gap-3">
          {peak > 0 && (
            <span className="text-xs text-muted-foreground/70">
              {t.chartPeak(peak)}
            </span>
          )}
          {avg > 0 && (
            <span className="text-xs text-muted-foreground/50">
              ∅ {avg}
            </span>
          )}
        </div>
      </div>

      <div className="h-40">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {t.chartLoading}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {t.chartNoData}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: hasPing ? 8 : 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${serverId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00ff88" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="players"
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              {hasPing && (
                <YAxis
                  yAxisId="ping"
                  orientation="right"
                  tick={{ fill: "#00d4ff", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}`}
                  width={28}
                />
              )}
              <Tooltip content={makeTooltip(locale)} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />
              {peak > 0 && (
                <ReferenceLine
                  yAxisId="players"
                  y={peak}
                  stroke="#00ff88"
                  strokeDasharray="4 4"
                  strokeOpacity={0.3}
                />
              )}
              <Area
                yAxisId="players"
                type="monotone"
                dataKey="players"
                stroke="#00ff88"
                strokeWidth={2}
                fill={`url(#grad-${serverId})`}
                dot={false}
                activeDot={{ r: 4, fill: "#00ff88", stroke: "#00ff8844", strokeWidth: 6 }}
              />
              {hasPing && (
                <Line
                  yAxisId="ping"
                  type="monotone"
                  dataKey="ping"
                  stroke="#00d4ff"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: "#00d4ff" }}
                  strokeOpacity={0.7}
                  strokeDasharray="0"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {hasPing && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-neon-green rounded inline-block" />
            {isRu ? "Игроки" : "Players"}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-neon-blue rounded inline-block opacity-70" />
            {isRu ? "Пинг" : "Ping"}
          </span>
        </div>
      )}
    </div>
  );
}
