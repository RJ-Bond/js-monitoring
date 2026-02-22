"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { GlobalLeaderboardEntry } from "@/types/server";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import SiteBrand from "@/components/SiteBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function LeaderboardPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [entries, setEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGlobalLeaderboard()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <SiteBrand size="sm" />
          <div className="flex-1" />
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-6 h-6 text-yellow-400" />
          <h1 className="text-2xl font-bold text-foreground">{t.leaderboardTitle}</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t.chartLoading}</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
            {t.leaderboardEmpty}
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-12">#</th>
                  <th className="px-4 py-3 text-left">{t.leaderboardPlayer}</th>
                  <th className="px-4 py-3 text-right">{t.leaderboardTotalTime}</th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">{t.leaderboardServers}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.rank}
                    onClick={() => router.push(`/player/${encodeURIComponent(entry.player_name)}`)}
                    className={cn(
                      "border-b border-white/5 last:border-0 transition-colors cursor-pointer hover:bg-white/5",
                      entry.rank <= 3 && "bg-yellow-400/5",
                    )}
                  >
                    <td className="px-4 py-3 font-bold">
                      {MEDAL[entry.rank] ?? (
                        <span className="text-muted-foreground">{entry.rank}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "font-semibold",
                        entry.rank === 1 ? "text-yellow-400"
                          : entry.rank === 2 ? "text-slate-300"
                          : entry.rank === 3 ? "text-amber-600"
                          : "text-foreground",
                      )}>
                        {entry.player_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-neon-blue">
                      {formatTime(entry.total_seconds)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      {entry.servers_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
