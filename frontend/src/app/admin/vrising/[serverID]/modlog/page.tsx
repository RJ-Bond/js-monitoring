"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowLeft, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type VRisingModLogEntry } from "@/lib/api";
import { toast } from "@/lib/toast";
import SiteBrand from "@/components/SiteBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

function eventBadge(message: string): { label: string; color: string } {
  const lower = message.toLowerCase();
  if (lower.includes("unban")) return { label: "РАЗБАН", color: "text-green-400 bg-green-400/10" };
  if (lower.includes("ban")) return { label: "БАН", color: "text-red-400 bg-red-400/10" };
  if (lower.includes("kick")) return { label: "КИК", color: "text-orange-400 bg-orange-400/10" };
  if (lower.includes("unmute")) return { label: "РАЗМУТ", color: "text-teal-400 bg-teal-400/10" };
  if (lower.includes("mute")) return { label: "МУТ", color: "text-yellow-400 bg-yellow-400/10" };
  if (lower.includes("warn")) return { label: "ВАРН", color: "text-amber-400 bg-amber-400/10" };
  if (lower.includes("filter")) return { label: "ФИЛЬТР", color: "text-purple-400 bg-purple-400/10" };
  return { label: "МОД", color: "text-blue-400 bg-blue-400/10" };
}

export default function VRisingModLogPage({ params }: { params: Promise<{ serverID: string }> }) {
  const { serverID } = use(params);
  const serverId = parseInt(serverID, 10);

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [events, setEvents] = useState<VRisingModLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user?.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getVRisingModLog(serverId);
      setEvents(data ?? []);
    } catch {
      toast("Не удалось загрузить журнал модерации", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, user]);

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
              <ClipboardList size={14} className="text-blue-400" />
              V Rising Журнал модерации — Сервер #{serverId}
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
              <ClipboardList size={20} className="text-blue-400" />
              Журнал модерации
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Последние 200 событий модерации с игрового сервера.
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
        ) : events.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет событий модерации.
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 w-[80px]">Тип</th>
                  <th className="text-left px-4 py-2.5">Игрок</th>
                  <th className="text-left px-4 py-2.5">Сообщение</th>
                  <th className="text-left px-4 py-2.5 w-[160px]">Время</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const badge = eventBadge(ev.message);
                  return (
                    <tr
                      key={ev.id}
                      className="border-t border-white/5 hover:bg-white/3 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {ev.player || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[400px] truncate">
                        {ev.message}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(ev.event_time)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
