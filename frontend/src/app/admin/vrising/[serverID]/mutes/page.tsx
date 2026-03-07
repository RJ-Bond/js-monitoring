"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RefreshCw, ArrowLeft, VolumeX, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type VRisingMute } from "@/lib/api";
import { toast } from "@/lib/toast";
import SiteBrand from "@/components/SiteBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Навсегда";
  const d = new Date(expiresAt);
  if (isNaN(d.getTime())) return "Навсегда";
  if (d.getTime() < Date.now()) return "Истёк";
  return d.toLocaleString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function VRisingMutesPage({ params }: { params: Promise<{ serverID: string }> }) {
  const { serverID } = use(params);
  const serverId = parseInt(serverID, 10);

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [mutes, setMutes] = useState<VRisingMute[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmuteTarget, setUnmuteTarget] = useState<VRisingMute | null>(null);

  useEffect(() => {
    if (!authLoading && user?.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getVRisingMutes(serverId);
      setMutes(data ?? []);
    } catch {
      toast("Не удалось загрузить муты", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, user]);

  const handleUnmute = async (mute: VRisingMute) => {
    try {
      await api.unmutePlayer(serverId, mute.steam_id);
      toast(`Размьючен ${mute.name || mute.steam_id}`);
      setMutes(prev => prev.filter(m => m.id !== mute.id));
    } catch {
      toast("Не удалось размьютить игрока", "error");
    } finally {
      setUnmuteTarget(null);
    }
  };

  if (authLoading || user?.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 gap-4">
          <div className="flex items-center gap-3">
            <SiteBrand />
            <span className="text-muted-foreground/40">/</span>
            <button
              onClick={() => router.push("/admin")}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft size={14} />
              Админ
            </button>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm flex items-center gap-1.5">
              <VolumeX size={14} className="text-orange-400" />
              V Rising Муты — Сервер #{serverId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <VolumeX size={20} className="text-orange-400" />
              Список мутов
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Муты синхронизируются с игрового сервера автоматически.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Обновить
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground animate-pulse text-sm">Загрузка...</div>
        ) : mutes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет активных мутов на этом сервере.
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Игрок</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Steam ID</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Причина</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Замьютил</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Дата мута</th>
                  <th className="text-left px-4 py-2.5">Истекает</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {mutes.map((mute) => {
                  const expired = mute.expires_at && new Date(mute.expires_at).getTime() < Date.now();
                  return (
                    <tr
                      key={mute.id}
                      className={`border-t border-white/5 hover:bg-white/3 transition-colors ${expired ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {mute.name || <span className="text-muted-foreground italic">неизвестен</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                        {mute.steam_id}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                        {mute.reason || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {mute.muted_by || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
                        {formatDate(mute.muted_at)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`flex items-center gap-1 ${expired ? "text-muted-foreground" : mute.expires_at ? "text-yellow-400" : "text-orange-400"}`}>
                          <Clock size={11} />
                          {formatExpiry(mute.expires_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setUnmuteTarget(mute)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs transition-colors"
                          title="Размьютить"
                        >
                          <Trash2 size={12} />
                          Размут
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {unmuteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="font-bold text-base flex items-center gap-2">
              <VolumeX size={18} className="text-orange-400" />
              Размьютить игрока
            </h2>
            <p className="text-sm text-muted-foreground">
              Вы уверены, что хотите размьютить{" "}
              <span className="text-foreground font-semibold">{unmuteTarget.name || unmuteTarget.steam_id}</span>?
              Команда на размут будет также отправлена на игровой сервер.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setUnmuteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => handleUnmute(unmuteTarget)}
                className="px-4 py-2 rounded-lg text-sm bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 transition-colors"
              >
                Размьютить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
