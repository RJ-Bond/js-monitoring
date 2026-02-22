"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, GitCompare } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Server, PlayerHistory } from "@/types/server";

const COLORS = ["#00ff88", "#00d4ff", "#a855f7", "#f59e0b"];

function formatTime(ts: string) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
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

  const [servers, setServers] = useState<Server[]>([]);
  const [histories, setHistories] = useState<Record<number, PlayerHistory[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }

    Promise.all(ids.map((id) =>
      Promise.all([
        api.getServer(id),
        api.getHistory(id, "24h"),
      ])
    )).then((results) => {
      setServers(results.map(([s]) => s));
      const hmap: Record<number, PlayerHistory[]> = {};
      results.forEach(([s, h]) => { hmap[s.id] = h; });
      setHistories(hmap);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, [ids.join(",")]);

  // Merge history data by timestamp (nearest 10-min bucket)
  const allTimestamps = Array.from(
    new Set(
      Object.values(histories)
        .flat()
        .map((h) => h.timestamp)
    )
  ).sort();

  const chartData = allTimestamps.slice(-144).map((ts) => {
    const entry: Record<string, string | number> = { time: formatTime(ts) };
    servers.forEach((srv) => {
      const h = histories[srv.id];
      const match = h?.find((x) => x.timestamp === ts);
      entry[srv.title || `Server ${srv.id}`] = match?.count ?? 0;
    });
    return entry;
  });

  if (ids.length < 2) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="glass-card rounded-2xl p-8 text-center max-w-sm">
          <GitCompare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t.compareEmpty}</p>
          <button onClick={() => router.push("/")} className="mt-4 text-sm text-neon-blue hover:underline">{t.adminBackToPanel}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push("/")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">{t.compareTitle}</h1>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">{t.chartLoading}</div>
        ) : (
          <>
            {/* Players chart */}
            <div className="glass-card rounded-2xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">{t.comparePlayers}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    {servers.map((srv, i) => (
                      <linearGradient key={srv.id} id={`cg${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(220,25%,10%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {servers.map((srv, i) => (
                    <Area
                      key={srv.id}
                      type="monotone"
                      dataKey={srv.title || `Server ${srv.id}`}
                      stroke={COLORS[i % COLORS.length]}
                      fill={`url(#cg${i})`}
                      strokeWidth={2}
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
                    <th className="px-4 py-3 text-center">{t.cardPlayers}</th>
                    <th className="px-4 py-3 text-center">{t.cardPing}</th>
                    <th className="px-4 py-3 text-center">{t.statusOnline}</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((srv, i) => (
                    <tr key={srv.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="font-medium text-foreground">{srv.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-foreground">
                        {srv.status?.online_status ? `${srv.status.players_now}/${srv.status.players_max}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-foreground">
                        {srv.status?.ping_ms ? `${srv.status.ping_ms}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${srv.status?.online_status ? "text-neon-green" : "text-red-400"}`}>
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
