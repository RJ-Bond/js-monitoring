"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, Server, Loader2, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import type { PlayerProfile } from "@/types/server";
import { useLanguage } from "@/contexts/LanguageContext";
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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PlayerProfilePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const name = decodeURIComponent(params.name as string);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.getPlayerProfile(name)
      .then((data) => {
        setProfile(data);
        if (!data.servers || data.servers.length === 0) setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [name]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
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

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : notFound || !profile ? (
          <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
            Player not found
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Player Header */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-neon-blue/20 border border-neon-blue/30 flex items-center justify-center text-2xl font-black text-neon-blue flex-shrink-0">
                  {profile.player_name[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{profile.player_name}</h1>
                  <p className="text-sm text-muted-foreground">{t.playerProfileTitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-3">
                  <Clock className="w-4 h-4 text-neon-blue" />
                  <span className="font-bold text-foreground">{formatTime(profile.total_seconds)}</span>
                  <span className="text-xs text-muted-foreground">{t.playerTotalTime}</span>
                </div>
                <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-3">
                  <Server className="w-4 h-4 text-neon-purple" />
                  <span className="font-bold text-foreground">{profile.servers?.length ?? 0}</span>
                  <span className="text-xs text-muted-foreground">{t.playerServers}</span>
                </div>
                <div className="flex flex-col items-center gap-1 bg-white/5 rounded-xl p-3 col-span-2 sm:col-span-1">
                  <CalendarDays className="w-4 h-4 text-neon-green" />
                  <span className="font-bold text-foreground text-sm">{formatDate(profile.last_seen)}</span>
                  <span className="text-xs text-muted-foreground">{t.playerLastSeen}</span>
                </div>
              </div>
            </div>

            {/* Servers */}
            {profile.servers && profile.servers.length > 0 && (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {t.playerServers}
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {profile.servers.map((s) => (
                      <tr key={s.server_id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-foreground font-medium">{s.server_name || `Server #${s.server_id}`}</td>
                        <td className="px-4 py-3 text-right font-mono text-neon-blue">{formatTime(s.total_seconds)}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden sm:table-cell">
                          {formatDate(s.last_seen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
