"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, GitCompare, TrendingUp, Users, Wifi } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush,
} from "recharts";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Server, PlayerHistory } from "@/types/server";

const COLORS = ["#00ff88", "#00d4ff", "#a855f7", "#f59e0b"];

type Period = "24h" | "7d" | "30d";

const CompareTooltip = ({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-semibold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-foreground truncate max-w-[120px]">{p.name}</span>
          <span style={{ color: p.color }}>{p.value}</span>
        </p>
      ))}
    </div>
  );
};

function formatTime(ts: string, period: Period) {
  const d = new Date(ts);
  if (period === "24h") return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  if (period === "7d") return d.toLocaleDateString("ru", { weekday: "short", day: "numeric" });
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

function CompareInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useLanguage();

  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter(Boolean)
    .slice(0, 4);

  const [period, setPeriod] = useState<Period>("24h");
  const [servers, setServers] = useState<Server[]>([]);
  const [histories, setHistories] = useState<Record<number, PlayerHistory[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }
    setLoading(true);

    Promise.all(ids.map((id) =>
      Promise.all([
        api.getServer(id),
        api.getHistory(id, period),
      ])
    )).then((results) => {
      setServers(results.map(([s]) => s));
      const hmap: Record<number, PlayerHistory[]> = {};
      results.forEach(([s, h]) => { hmap[s.id] = h; });
      setHistories(hmap);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, [ids.join(","), period]);

  const allTimestamps = Array.from(
    new Set(Object.values(histories).flat().map((h) => h.timestamp))
  ).sort();

  const chartData = allTimestamps.slice(-144).map((ts) => {
    const entry: Record<string, string | number> = { time: formatTime(ts, period) };
    servers.forEach((srv) => {
      const h = histories[srv.id];
      const match = h?.find((x) => x.timestamp === ts);
      entry[srv.title || `Server ${srv.id}`] = match?.count ?? 0;
    });
    return entry;
  });

  // Per-server stats
  const serverStats = servers.map((srv) => {
    const h = histories[srv.id] ?? [];
    const counts = h.map((x) => x.count);
    const peak = counts.length ? Math.max(...counts) : 0;
    const avg = counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
    return { srv, peak, avg };
  });

  if (ids.length < 2) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="glass-card rounded-2xl p-8 text-center max-w-sm">
          <GitCompare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t.compareEmpty}</p>
          <button onClick={() => router.push("/")} className="mt-4 text-sm text-neon-blue hover:underline">
            {t.adminBackToPanel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">{t.compareTitle}</h1>
          <div className="ml-auto flex gap-1">
            {(["24h", "7d", "30d"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p
                    ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            {t.chartLoading}
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {serverStats.map(({ srv, peak, avg }, i) => (
                <div key={srv.id} className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-xs font-medium text-foreground truncate">{srv.title}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <div className="text-xs text-muted-foreground/60 flex items-center gap-0.5">
                        <TrendingUp className="w-2.5 h-2.5" /> {t.comparePeak}
                      </div>
                      <div className="text-sm font-bold text-foreground">{peak}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground/60 flex items-center gap-0.5">
                        <Users className="w-2.5 h-2.5" /> {t.chartAvg}
                      </div>
                      <div className="text-sm font-bold text-foreground">{avg}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Players chart */}
            <div className="glass-card rounded-2xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                {t.comparePlayers}
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    {servers.map((srv, i) => (
                      <linearGradient key={srv.id} id={`cg${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={COLORS[i % COLORS.length]} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CompareTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Brush
                    dataKey="time"
                    height={20}
                    stroke="rgba(255,255,255,0.1)"
                    fill="rgba(255,255,255,0.03)"
                    travellerWidth={6}
                    startIndex={Math.max(0, chartData.length - 48)}
                  />
                  {servers.map((srv, i) => (
                    <Area
                      key={srv.id}
                      type="monotone"
                      dataKey={srv.title || `Server ${srv.id}`}
                      stroke={COLORS[i % COLORS.length]}
                      fill={`url(#cg${i})`}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Server table */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Server</th>
                    <th className="px-4 py-3 text-center">
                      <span className="flex items-center justify-center gap-1"><Users className="w-3 h-3" />{t.cardPlayers}</span>
                    </th>
                    <th className="px-4 py-3 text-center">
                      <span className="flex items-center justify-center gap-1"><Wifi className="w-3 h-3" />{t.cardPing}</span>
                    </th>
                    <th className="px-4 py-3 text-center">
                      <span className="flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />{t.comparePeak}</span>
                    </th>
                    <th className="px-4 py-3 text-center">{t.statusOnline}</th>
                  </tr>
                </thead>
                <tbody>
                  {serverStats.map(({ srv, peak }, i) => (
                    <tr key={srv.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          <span className="font-medium text-foreground">{srv.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-foreground">
                        {srv.status?.online_status ? `${srv.status.players_now}/${srv.status.players_max}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-foreground">
                        {srv.status?.ping_ms ? `${srv.status.ping_ms}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">{peak || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          srv.status?.online_status ? "text-neon-green" : "text-red-400"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
                          {srv.status?.online_status ? t.statusOnline : t.statusOffline}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareInner />
    </Suspense>
  );
}
