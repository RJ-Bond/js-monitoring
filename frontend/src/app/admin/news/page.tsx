"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, Plus, Pencil, Trash2, X, Save, User, Pin, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import type { NewsFormData } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SiteBrand from "@/components/SiteBrand";
import type { NewsItem } from "@/types/server";
import { parseTags } from "@/types/server"; // used in list rows

// Minimal safe markdown → HTML renderer (admin-only content)
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0;display:block">');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:.95rem;font-weight:700;margin:12px 0 4px">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.05rem;font-weight:700;margin:16px 0 6px">$1</h2>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm,
    '<blockquote style="border-left:3px solid rgba(255,255,255,.2);margin:6px 0;padding:4px 12px;color:rgba(255,255,255,.6);font-style:italic">$1</blockquote>');

  // List items
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:1.4em;list-style-type:disc">$1</li>');

  // Inline bold, italic, code, links
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g,
    '<code style="font-family:monospace;background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;font-size:.85em">$1</code>');
  html = html.replace(/\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" style="color:#38bdf8;text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Wrap double-newline blocks in <p>
  html = html
    .split("\n\n")
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (/^<(h[23]|li|blockquote|img)/.test(t)) return t;
      return `<p style="margin:6px 0;line-height:1.6">${t.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

const EMPTY_FORM: NewsFormData = {
  title: "",
  content: "",
  image_url: "",
  tags: "",
  pinned: false,
  published: true,
  publish_at: null,
};

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
  const [form, setForm] = useState<NewsFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [deleteConfirm, setDeleteConfirm] = useState<NewsItem | null>(null);
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
      const data = await api.getAdminNews();
      setNews(data.items);
    } catch {
      setError("Failed to load news");
    } finally {
      setLoading(false);
    }
  };

  const setField = <K extends keyof NewsFormData>(k: K, v: NewsFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setEditorTab("write");
    setModalOpen(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditItem(item);
    setForm({
      title: item.title,
      content: item.content,
      image_url: item.image_url ?? "",
      tags: item.tags ?? "",
      pinned: item.pinned,
      published: item.published,
      publish_at: item.publish_at
        ? new Date(item.publish_at).toISOString().slice(0, 16)
        : null,
    });
    setFormError("");
    setEditorTab("write");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
    setFormError("");
  };

  const insertAtCursor = (before: string, after = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = form.content.slice(start, end);
    const newText =
      form.content.slice(0, start) + before + selected + after + form.content.slice(end);
    setField("content", newText);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setFormError("Title and content are required");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload: NewsFormData = {
        ...form,
        title: form.title.trim(),
        content: form.content.trim(),
        publish_at: form.publish_at || null,
      };
      if (editItem) {
        const updated = await api.updateNews(editItem.id, payload);
        setNews((prev) => prev.map((n) => (n.id === editItem.id ? updated : n)));
      } else {
        const created = await api.createNews(payload);
        setNews((prev) => [created, ...prev]);
      }
      closeModal();
    } catch {
      setFormError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteNews(deleteConfirm.id);
      setNews((prev) => prev.filter((n) => n.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch {
      setDeleteConfirm(null);
    }
  };

  const togglePin = async (item: NewsItem) => {
    try {
      const updated = await api.updateNews(item.id, {
        title: item.title,
        content: item.content,
        image_url: item.image_url ?? "",
        tags: item.tags ?? "",
        pinned: !item.pinned,
        published: item.published,
        publish_at: item.publish_at ?? null,
      });
      setNews((prev) => prev.map((n) => (n.id === item.id ? updated : n)));
    } catch { /* ignore */ }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  const toolbar: { label: string; title: string; before: string; after: string; cls?: string }[] = [
    { label: "B",    title: "Bold",       before: "**",    after: "**",     cls: "font-bold" },
    { label: "I",    title: "Italic",     before: "*",     after: "*",      cls: "italic" },
    { label: "H2",   title: "Heading 2",  before: "## ",   after: "",       cls: "font-semibold" },
    { label: "H3",   title: "Heading 3",  before: "### ",  after: "",       cls: "font-semibold" },
    { label: "🔗",   title: "Link",       before: "[",     after: "](url)" },
    { label: "—",    title: "List item",  before: "- ",    after: "" },
    { label: "`·`",  title: "Code",       before: "`",     after: "`",      cls: "font-mono text-[10px]" },
    { label: "❝",    title: "Blockquote", before: "> ",    after: "" },
    { label: "🖼",   title: "Image",      before: "![",    after: "](url)" },
  ];

  const tagPills = (form.tags ?? "").split(",").map(s => s.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <SiteBrand size="lg" />
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
            {news.map((item) => {
              const isScheduled = !item.published && item.publish_at;
              return (
                <div
                  key={item.id}
                  className={`glass-card rounded-2xl p-5 flex gap-4 items-start border-l-2 ${
                    item.pinned ? "border-neon-green/50" : "border-neon-blue/40"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm text-foreground truncate">{item.title}</h3>
                      {item.pinned && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neon-green/10 text-neon-green border border-neon-green/20">
                          📌 {t.newsPinned}
                        </span>
                      )}
                      {!item.published && !isScheduled && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                          {t.newsDraft}
                        </span>
                      )}
                      {isScheduled && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-400/10 text-blue-400 border border-blue-400/20">
                          🕒 {t.newsScheduled}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      {item.author_name && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/70 flex-shrink-0">
                          <User className="w-3 h-3" />
                          {item.author_name}
                        </span>
                      )}
                      {item.views > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/60 flex-shrink-0">
                          <Eye className="w-3 h-3" />
                          {item.views}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-wrap">
                      {item.content}
                    </p>
                    {parseTags(item).length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {parseTags(item).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-muted-foreground border border-white/10">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => togglePin(item)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        item.pinned
                          ? "text-neon-green bg-neon-green/10"
                          : "text-muted-foreground hover:text-neon-green hover:bg-neon-green/10"
                      }`}
                      title={item.pinned ? "Unpin" : "Pin"}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                      title={t.newsEdit}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(item)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title={t.newsDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div className="w-full max-w-sm glass-card rounded-2xl p-6 flex flex-col gap-4 animate-fade-in border border-red-500/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">{t.newsConfirmDelete(deleteConfirm.title)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.deleteModalTitle}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-foreground transition-all"
              >
                {t.newsCancel}
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
              >
                {t.newsDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-2xl glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <h2 className="font-bold text-base">
                {editItem ? `✏️ ${t.newsEdit}` : t.newsAdd}
              </h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 flex flex-col gap-3 overflow-y-auto">
              {/* Title */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsPostTitle}</label>
                <input
                  className={inputCls}
                  placeholder={t.newsTitlePlaceholder}
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                />
              </div>

              {/* Content editor */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsContent}</label>
                  <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                    {(["write", "preview"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setEditorTab(tab)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          editorTab === tab ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab === "write" ? t.newsWrite : t.newsPreview}
                      </button>
                    ))}
                  </div>
                </div>

                {editorTab === "write" ? (
                  <div>
                    <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 border-b-0 rounded-t-xl px-2 py-1.5 flex-wrap">
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
                      <span className={`text-xs pr-1 ${form.content.length > 4000 ? "text-red-400" : "text-muted-foreground/30"}`}>
                        {form.content.length}
                      </span>
                    </div>
                    <textarea
                      ref={textareaRef}
                      className="w-full bg-white/5 border border-white/10 rounded-b-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground resize-none font-mono leading-relaxed"
                      rows={10}
                      placeholder={t.newsContentPlaceholder}
                      value={form.content}
                      onChange={(e) => setField("content", e.target.value)}
                    />
                  </div>
                ) : (
                  <div
                    className="min-h-[13rem] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground overflow-auto"
                    dangerouslySetInnerHTML={{
                      __html: form.content
                        ? renderMarkdown(form.content)
                        : `<span style="color:rgba(255,255,255,.25)">${t.newsContentPlaceholder}</span>`,
                    }}
                  />
                )}
              </div>

              {/* Image URL */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsImageUrl}</label>
                <input
                  className={inputCls}
                  placeholder="https://example.com/image.jpg"
                  value={form.image_url ?? ""}
                  onChange={(e) => setField("image_url", e.target.value)}
                />
                {form.image_url && (
                  <img
                    src={form.image_url}
                    alt="preview"
                    className="mt-1 rounded-lg object-cover h-24 w-full"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsTags}</label>
                <input
                  className={inputCls}
                  placeholder="Важно, Обновление"
                  value={form.tags ?? ""}
                  onChange={(e) => setField("tags", e.target.value)}
                />
                {tagPills.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {tagPills.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] bg-neon-blue/10 text-neon-blue border border-neon-blue/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggles row */}
              <div className="flex gap-4 flex-wrap">
                {/* Pinned */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.pinned}
                    onChange={(e) => setField("pinned", e.target.checked)}
                    className="w-4 h-4 rounded accent-green-400"
                  />
                  <span className="text-sm text-foreground">📌 {t.newsPinned}</span>
                </label>

                {/* Published */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setField("published", e.target.checked)}
                    className="w-4 h-4 rounded accent-green-400"
                  />
                  <span className="text-sm text-foreground">{t.newsPublished}</span>
                </label>
              </div>

              {/* Publish At (only when not published) */}
              {!form.published && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsPublishAt}</label>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={form.publish_at ?? ""}
                    onChange={(e) => setField("publish_at", e.target.value || null)}
                  />
                </div>
              )}

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
