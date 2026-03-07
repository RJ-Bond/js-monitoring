"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Shield, Trash2, RefreshCw, ArrowLeft, UserX, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type VRisingBan } from "@/lib/api";
import { toast } from "@/lib/toast";
import SiteBrand from "@/components/SiteBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Навсегда";
  const d = new Date(expiresAt);
  if (isNaN(d.getTime())) return "Навсегда";
  const now = Date.now();
  if (d.getTime() < now) return "Истёк";
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

export default function VRisingBansPage({ params }: { params: Promise<{ serverID: string }> }) {
  const { serverID } = use(params);
  const serverId = parseInt(serverID, 10);

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [bans, setBans] = useState<VRisingBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [unbanTarget, setUnbanTarget] = useState<VRisingBan | null>(null);

  useEffect(() => {
    if (!authLoading && user?.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getVRisingBans(serverId);
      setBans(data ?? []);
    } catch {
      toast("Не удалось загрузить баны", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, user]);

  const handleUnban = async (ban: VRisingBan) => {
    try {
      await api.unbanPlayer(serverId, ban.steam_id);
      toast(`Разбанен ${ban.name || ban.steam_id}`);
      setBans(prev => prev.filter(b => b.id !== ban.id));
    } catch {
      toast("Не удалось разбанить игрока", "error");
    } finally {
      setUnbanTarget(null);
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
              <Shield size={14} className="text-neon-green" />
              V Rising Баны — Сервер #{serverId}
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
              <UserX size={20} className="text-red-400" />
              Список банов
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Баны синхронизируются с игрового сервера автоматически.
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
        ) : bans.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет активных банов на этом сервере.
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Игрок</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Steam ID</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Причина</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Забанил</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Дата бана</th>
                  <th className="text-left px-4 py-2.5">Истекает</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {bans.map((ban, i) => {
                  const expired = ban.expires_at && new Date(ban.expires_at).getTime() < Date.now();
                  return (
                    <tr
                      key={ban.id}
                      className={`border-t border-white/5 hover:bg-white/3 transition-colors ${expired ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {ban.name || <span className="text-muted-foreground italic">неизвестен</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                        {ban.steam_id}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                        {ban.reason || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {ban.banned_by || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
                        {formatDate(ban.banned_at)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`flex items-center gap-1 ${expired ? "text-muted-foreground" : ban.expires_at ? "text-yellow-400" : "text-red-400"}`}>
                          <Clock size={11} />
                          {formatExpiry(ban.expires_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setUnbanTarget(ban)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
                          title="Разбанить"
                        >
                          <Trash2 size={12} />
                          Разбан
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

      {unbanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="font-bold text-base flex items-center gap-2">
              <UserX size={18} className="text-red-400" />
              Разбанить игрока
            </h2>
            <p className="text-sm text-muted-foreground">
              Вы уверены, что хотите разбанить{" "}
              <span className="text-foreground font-semibold">{unbanTarget.name || unbanTarget.steam_id}</span>?
              Команда на разбан будет также отправлена на игровой сервер.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setUnbanTarget(null)}
                className="px-4 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => handleUnban(unbanTarget)}
                className="px-4 py-2 rounded-lg text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
              >
                Разбанить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
