"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowLeft, Megaphone, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type VRisingAnnouncement } from "@/lib/api";
import { toast } from "@/lib/toast";
import SiteBrand from "@/components/SiteBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч`;
  return `${Math.floor(seconds / 86400)} д`;
}

const INTERVAL_PRESETS = [
  { label: "1 мин",   value: 60 },
  { label: "5 мин",   value: 300 },
  { label: "10 мин",  value: 600 },
  { label: "15 мин",  value: 900 },
  { label: "30 мин",  value: 1800 },
  { label: "1 час",   value: 3600 },
  { label: "2 часа",  value: 7200 },
  { label: "6 часов", value: 21600 },
];

interface FormState {
  message: string;
  interval_seconds: number;
  is_active: boolean;
  sort_order: number;
}

const emptyForm = (): FormState => ({
  message: "",
  interval_seconds: 300,
  is_active: true,
  sort_order: 0,
});

export default function VRisingAnnouncementsPage({ params }: { params: Promise<{ serverID: string }> }) {
  const { serverID } = use(params);
  const serverId = parseInt(serverID, 10);

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [items, setItems] = useState<VRisingAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && user?.role !== "admin") router.replace("/");
  }, [authLoading, user, router]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getVRisingAnnouncements(serverId);
      setItems(data ?? []);
    } catch {
      toast("Не удалось загрузить объявления", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, user]);

  const startNew = () => {
    setForm(emptyForm());
    setEditingId("new");
    setDeleteConfirm(null);
  };

  const startEdit = (item: VRisingAnnouncement) => {
    setForm({
      message: item.message,
      interval_seconds: item.interval_seconds,
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    setEditingId(item.id);
    setDeleteConfirm(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    if (!form.message.trim()) { toast("Введите текст объявления", "error"); return; }
    setSaving(true);
    try {
      if (editingId === "new") {
        await api.createVRisingAnnouncement(serverId, form);
        toast("Объявление создано", "success");
      } else if (editingId !== null) {
        await api.updateVRisingAnnouncement(serverId, editingId, form);
        toast("Объявление обновлено", "success");
      }
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch {
      toast("Ошибка сохранения", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteVRisingAnnouncement(serverId, id);
      toast("Объявление удалено", "success");
      setDeleteConfirm(null);
      await load();
    } catch {
      toast("Ошибка удаления", "error");
    }
  };

  const toggleActive = async (item: VRisingAnnouncement) => {
    try {
      await api.updateVRisingAnnouncement(serverId, item.id, {
        message: item.message,
        interval_seconds: item.interval_seconds,
        is_active: !item.is_active,
        sort_order: item.sort_order,
      });
      await load();
    } catch {
      toast("Ошибка", "error");
    }
  };

  if (authLoading || user?.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3 gap-4">
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
              <Megaphone size={14} className="text-amber-400" />
              Объявления — Сервер #{serverId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Megaphone size={20} className="text-amber-400" />
              Авто-объявления
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Объявления транслируются игрокам автоматически через заданный интервал.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Обновить
            </button>
            {editingId === null && (
              <button
                onClick={startNew}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm transition-colors"
              >
                <Plus size={14} />
                Добавить
              </button>
            )}
          </div>
        </div>

        {/* New / Edit form */}
        {editingId !== null && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-amber-400">
              {editingId === "new" ? "Новое объявление" : "Редактировать объявление"}
            </h2>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Текст объявления</label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3}
                placeholder="<color=#55ff55>Добро пожаловать на сервер!</color>"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 resize-y"
              />
              <p className="text-xs text-muted-foreground mt-1">Поддерживается Unity rich text: &lt;color=#ff0000&gt;текст&lt;/color&gt;</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Интервал</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setForm(f => ({ ...f, interval_seconds: p.value }))}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        form.interval_seconds === p.value
                          ? "bg-amber-500/30 text-amber-400 border border-amber-500/50"
                          : "bg-white/5 hover:bg-white/10 text-muted-foreground border border-transparent"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    value={form.interval_seconds}
                    onChange={e => setForm(f => ({ ...f, interval_seconds: parseInt(e.target.value) || 300 }))}
                    className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500/50"
                  />
                  <span className="text-xs text-muted-foreground">секунд ({formatInterval(form.interval_seconds)})</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Порядок сортировки</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                      form.is_active ? "bg-amber-500" : "bg-white/20"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                      form.is_active ? "translate-x-4" : "translate-x-0.5"
                    }`} />
                  </button>
                  <span className="text-sm">{form.is_active ? "Активно" : "Отключено"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm transition-colors disabled:opacity-50"
              >
                <Check size={14} />
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
              >
                <X size={14} />
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground animate-pulse text-sm">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет объявлений. Нажмите «Добавить» чтобы создать первое.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-colors ${
                  item.is_active
                    ? "border-white/10 bg-white/3"
                    : "border-white/5 bg-white/1 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm break-words whitespace-pre-wrap">{item.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                        каждые {formatInterval(item.interval_seconds)}
                      </span>
                      {item.sort_order !== 0 && (
                        <span className="text-xs text-muted-foreground">порядок: {item.sort_order}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        item.is_active
                          ? "text-green-400 bg-green-400/10"
                          : "text-muted-foreground bg-white/5"
                      }`}>
                        {item.is_active ? "Активно" : "Отключено"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(item)}
                      title={item.is_active ? "Отключить" : "Включить"}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.is_active
                        ? <X size={14} className="text-muted-foreground" />
                        : <Check size={14} className="text-green-400" />}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    {deleteConfirm === item.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => remove(item.id)}
                          className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          Удалить
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
