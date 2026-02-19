"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, Plus, Pencil, Trash2, X, Save, Gamepad2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { NewsItem } from "@/types/server";

export default function AdminNewsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<NewsItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/");
      return;
    }
    fetchNews();
  }, [isAuthenticated, isLoading, user, router]);

  const fetchNews = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getNews();
      setNews(data);
    } catch {
      setError("Failed to load news");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    setFormTitle("");
    setFormContent("");
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditItem(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
    setFormError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError("Title and content are required");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editItem) {
        const updated = await api.updateNews(editItem.id, formTitle.trim(), formContent.trim());
        setNews((prev) => prev.map((n) => (n.id === editItem.id ? updated : n)));
      } else {
        const created = await api.createNews(formTitle.trim(), formContent.trim());
        setNews((prev) => [created, ...prev]);
      }
      closeModal();
    } catch {
      setFormError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: NewsItem) => {
    if (!confirm(t.newsConfirmDelete(item.title))) return;
    try {
      await api.deleteNews(item.id);
      setNews((prev) => prev.filter((n) => n.id !== item.id));
    } catch {
      alert("Failed to delete");
    }
  };

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <div className="w-8 h-8 bg-neon-green/20 border border-neon-green/40 rounded-xl flex items-center justify-center">
                <Gamepad2 className="w-4 h-4 text-neon-green" />
              </div>
            </a>
            <span className="text-muted-foreground">/</span>
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-sm">{t.newsTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <a href="/" className="px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all">
              {t.newsBackToMain}
            </a>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t.newsAdd}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-3">{error}</p>
        ) : news.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <Newspaper className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">{t.newsEmpty}</p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all"
            >
              <Plus className="w-4 h-4" />{t.newsAdd}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {news.map((item) => (
              <div key={item.id} className="glass-card rounded-2xl p-5 flex gap-4 items-start border-l-2 border-neon-blue/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm text-foreground truncate">{item.title}</h3>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                    title={t.newsEdit}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    title={t.newsDelete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-lg glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="font-bold text-base">
                {editItem ? `✏️ ${t.newsEdit}` : t.newsAdd}
              </h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsPostTitle}</label>
                <input
                  className={inputCls}
                  placeholder={t.newsTitlePlaceholder}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsContent}</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={5}
                  placeholder={t.newsContentPlaceholder}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>
              {formError && (
                <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all"
                >
                  {t.newsCancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? t.newsSaving : t.newsSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
