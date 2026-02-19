"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, Plus, Pencil, Trash2, X, Save, Gamepad2, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { NewsItem } from "@/types/server";

// Minimal safe markdown → HTML renderer (admin-only content)
function renderMarkdown(md: string): string {
  // Escape HTML entities first
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Block-level: headings and list items
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:.95rem;font-weight:700;margin:12px 0 4px">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.05rem;font-weight:700;margin:16px 0 6px">$1</h2>');
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:1.4em;list-style-type:disc">$1</li>');

  // Inline: bold, italic, links
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#38bdf8;text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Wrap double-newline blocks in <p>
  html = html
    .split("\n\n")
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (/^<(h[23]|li)/.test(t)) return t;
      return `<p style="margin:6px 0;line-height:1.6">${t.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

export default function AdminNewsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editor modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<NewsItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setEditorTab("write");
    setModalOpen(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditItem(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormError("");
    setEditorTab("write");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
    setFormError("");
  };

  // Insert markdown syntax at current cursor / selection
  const insertAtCursor = (before: string, after = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = formContent.slice(start, end);
    const newText =
      formContent.slice(0, start) + before + selected + after + formContent.slice(end);
    setFormContent(newText);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
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

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  const toolbar: { label: string; title: string; before: string; after: string; cls?: string }[] = [
    { label: "B",   title: "Bold",      before: "**",   after: "**",    cls: "font-bold" },
    { label: "I",   title: "Italic",    before: "*",    after: "*",     cls: "italic" },
    { label: "H2",  title: "Heading 2", before: "## ",  after: "",      cls: "font-semibold" },
    { label: "H3",  title: "Heading 3", before: "### ", after: "",      cls: "font-semibold" },
    { label: "🔗",  title: "Link",      before: "[",    after: "](url)" },
    { label: "—",   title: "List item", before: "- ",   after: "" },
  ];

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
            <a
              href="/"
              className="px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all"
            >
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
            <p className="font-semibold">{t.newsEmpty}</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all"
            >
              <Plus className="w-4 h-4" />
              {t.newsAdd}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {news.map((item) => (
              <div
                key={item.id}
                className="glass-card rounded-2xl p-5 flex gap-4 items-start border-l-2 border-neon-blue/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-sm text-foreground truncate">{item.title}</h3>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    {item.author_name && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground/70 flex-shrink-0">
                        <User className="w-3 h-3" />
                        {item.author_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {item.content}
                  </p>
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-2xl glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="font-bold text-base">
                {editItem ? `✏️ ${t.newsEdit}` : t.newsAdd}
              </h2>
              <button
                onClick={closeModal}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 flex flex-col gap-3">
              {/* Title field */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t.newsPostTitle}
                </label>
                <input
                  className={inputCls}
                  placeholder={t.newsTitlePlaceholder}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* Content editor with Write / Preview tabs */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t.newsContent}
                  </label>
                  <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setEditorTab("write")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        editorTab === "write"
                          ? "bg-white/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.newsWrite}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab("preview")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        editorTab === "preview"
                          ? "bg-white/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.newsPreview}
                    </button>
                  </div>
                </div>

                {editorTab === "write" ? (
                  <div>
                    {/* Toolbar */}
                    <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 border-b-0 rounded-t-xl px-2 py-1.5">
                      {toolbar.map((btn) => (
                        <button
                          key={btn.title}
                          type="button"
                          title={btn.title}
                          onClick={() => insertAtCursor(btn.before, btn.after)}
                          className={`px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all min-w-[1.75rem] text-center ${btn.cls ?? ""}`}
                        >
                          {btn.label}
                        </button>
                      ))}
                      <span className="ml-auto text-xs text-muted-foreground/40 pr-1">Markdown</span>
                    </div>
                    <textarea
                      ref={textareaRef}
                      className="w-full bg-white/5 border border-white/10 rounded-b-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground resize-none font-mono leading-relaxed"
                      rows={12}
                      placeholder={t.newsContentPlaceholder}
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                    />
                  </div>
                ) : (
                  <div
                    className="min-h-[15.5rem] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground overflow-auto"
                    dangerouslySetInnerHTML={{
                      __html: formContent
                        ? renderMarkdown(formContent)
                        : `<span style="color:rgba(255,255,255,.25)">${t.newsContentPlaceholder}</span>`,
                    }}
                  />
                )}
              </div>

              {formError && (
                <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">
                  {formError}
                </p>
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
