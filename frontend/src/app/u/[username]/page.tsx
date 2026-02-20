"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Shield, CalendarDays, Server, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { PublicProfile } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn, gameTypeLabel } from "@/lib/utils";
import StatusIndicator from "@/components/StatusIndicator";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GameIcon from "@/components/GameIcon";
import SiteBrand from "@/components/SiteBrand";
import { ToastContainer } from "@/components/Toast";

const AVATAR_COLORS = [
  "from-neon-green/30 to-neon-blue/30 text-neon-green",
  "from-neon-blue/30 to-neon-purple/30 text-neon-blue",
  "from-neon-purple/30 to-yellow-400/20 text-neon-purple",
  "from-yellow-400/30 to-neon-green/20 text-yellow-400",
];

function LetterAvatar({ name }: { name: string }) {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return (
    <div className={cn(
      "w-20 h-20 rounded-full bg-gradient-to-br flex items-center justify-center font-black text-3xl flex-shrink-0 ring-2 ring-white/10",
      AVATAR_COLORS[idx],
    )}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { t, locale } = useLanguage();

  const [profile, setProfile]   = useState<PublicProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    api.getPublicProfile(username)
      .then(setProfile)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username]);

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "—";

  const onlineServers = (profile?.servers ?? []).filter(s => s.status?.online_status);
  const offlineServers = (profile?.servers ?? []).filter(s => !s.status?.online_status);
  const sorted = [...onlineServers, ...offlineServers];

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t.profileBackToMain}
          </button>
          <div className="flex items-center gap-2">
            <SiteBrand className="hidden sm:flex" />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {notFound && (
          <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-3">
            <p className="text-4xl">🙈</p>
            <p className="text-lg font-bold">{t.publicProfileNotFound}</p>
            <p className="text-sm text-muted-foreground">@{username}</p>
          </div>
        )}

        {profile && (
          <>
            {/* Profile card */}
            <div className="glass-card rounded-2xl p-6 flex items-center gap-5">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.username}
                  className="w-20 h-20 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
                />
              ) : (
                <LetterAvatar name={profile.username} />
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-black truncate">{profile.username}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {profile.role === "admin" && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                      <Shield className="w-3 h-3" />{t.roleAdmin}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/5 text-muted-foreground border border-white/10">
                    <CalendarDays className="w-3 h-3" />{t.publicProfileJoined}: {joinedDate}
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-neon-blue/10 text-neon-blue border border-neon-blue/20">
                    <Server className="w-3 h-3" />{profile.servers.length} {t.publicProfileServers}
                  </span>
                </div>
              </div>
            </div>

            {/* Servers */}
            {sorted.length > 0 && (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                  <Server className="w-4 h-4 text-neon-blue" />
                  <span className="text-sm font-semibold uppercase tracking-wider">{t.publicProfileServers}</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-neon-blue/10 text-neon-blue/80 border border-neon-blue/20">
                    {sorted.length}
                  </span>
                </div>
                <div className="divide-y divide-white/5">
                  {sorted.map(srv => (
                    <div key={srv.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-colors">
                      <GameIcon gameType={srv.game_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {srv.title || srv.status?.server_name || srv.ip}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {gameTypeLabel(srv.game_type)} · {srv.display_ip || srv.ip}:{srv.port}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {srv.status?.online_status && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {srv.status.players_now}/{srv.status.players_max}
                          </span>
                        )}
                        <StatusIndicator online={srv.status?.online_status ?? false} size="sm" showLabel />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <ToastContainer />
    </div>
  );
}
