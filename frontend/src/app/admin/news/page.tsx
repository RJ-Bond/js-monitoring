"use client";

import { useEffect, useState, useRef, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, Plus, Pencil, Trash2, X, Save, User, Pin, Eye, Copy, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import type { NewsFormData } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SiteBrand from "@/components/SiteBrand";
import type { NewsItem } from "@/types/server";
import { parseTags } from "@/types/server";
import { renderDiscordMarkdown, renderTelegramMarkdown } from "@/lib/markdown";
import { DiscordIcon, TelegramIcon } from "@/components/BrandIcons";

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0;display:block">');
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:.95rem;font-weight:700;margin:12px 0 4px">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.05rem;font-weight:700;margin:16px 0 6px">$1</h2>');
  html = html.replace(/^&gt; (.+)$/gm,
    '<blockquote style="border-left:3px solid rgba(255,255,255,.2);margin:6px 0;padding:4px 12px;color:rgba(255,255,255,.6);font-style:italic">$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:1.4em;list-style-type:disc">$1</li>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g,
    '<code style="font-family:monospace;background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;font-size:.85em">$1</code>');
  html = html.replace(/\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" style="color:#38bdf8;text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>');
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


function DiscordNewsPreview({ form }: { form: NewsFormData }) {
  const color   = form.pinned ? "#f0c030" : "#00b0f4";
  const desc    = form.content.length > 350 ? form.content.slice(0, 350) + "…" : form.content;
  const tagList = (form.tags ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const now     = new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const today   = new Date().toLocaleDateString("ru", { day: "numeric", month: "long" });
  const descHtml = useMemo(() => renderDiscordMarkdown(desc), [desc]);

  return (
    <div style={{ background: "#313338", padding: "12px 10px", fontSize: 13,
      fontFamily: "Whitney, 'Helvetica Neue', Helvetica, Arial, sans-serif", minHeight: "100%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#5865f2",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
          BOT
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: "white", fontWeight: 600, fontSize: 13 }}>JS Monitor</span>
            <span style={{ color: "#949ba4", fontWeight: 400, fontSize: 11, marginLeft: 8 }}>сегодня в {now}</span>
          </div>
          <div style={{ background: "#2b2d31", borderRadius: 4, display: "flex", overflow: "hidden" }}>
            <div style={{ width: 4, background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, padding: "8px 12px 10px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {form.title && (
                    <div style={{ color: "white", fontWeight: 700, fontSize: 14, marginBottom: 4, lineHeight: 1.2 }}>
                      {form.title}
                    </div>
                  )}
                  {desc && (
                    <div style={{ color: "#dbdee1", fontSize: 13, lineHeight: 1.35, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                      dangerouslySetInnerHTML={{ __html: descHtml }}
                    />
                  )}
                </div>
                {form.image_url && (
                  <img src={form.image_url} alt=""
                    style={{ width: 72, height: 72, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>
              {tagList.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: "white", fontWeight: 600, fontSize: 12, marginBottom: 2 }}>🏷️ Теги</div>
                  <div style={{ color: "#dbdee1", fontSize: 12 }}>{tagList.join(", ")}</div>
                </div>
              )}
              <div style={{ color: "#949ba4", fontSize: 11, marginTop: 8 }}>
                JS Monitor · {today}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramNewsPreview({ form }: { form: NewsFormData }) {
  const now         = new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const contentHtml = useMemo(() => renderTelegramMarkdown(form.content), [form.content]);

  return (
    <div style={{ background: "#17212b", padding: "12px 10px", minHeight: "100%" }}>
      <div style={{ fontSize: 11, color: "#8babb8", textAlign: "center", marginBottom: 10 }}>
        📢 Канал · Предпросмотр
      </div>
      <div style={{ background: "#182533", borderRadius: 16, borderBottomLeftRadius: 4,
        maxWidth: 280, overflow: "hidden", fontSize: 13,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        {form.image_url && (
          <img src={form.image_url} alt=""
            style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div style={{ padding: "8px 12px 6px" }}>
          {form.title && (
            <div style={{ color: "#e8f0f7", fontWeight: 700, fontSize: 14, marginBottom: 3, lineHeight: 1.3 }}>
              {form.title}
            </div>
          )}
          {form.content && (
            <div style={{ color: "#e8f0f7", fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          )}
          <div style={{ color: "#6c8fa8", fontSize: 11, textAlign: "right", marginTop: 6 }}>
            {now} ✓✓
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM: NewsFormData = {
  title: "",
  content: "",
  image_url: "",
  tags: "",
  pinned: false,
  published: true,
  publish_at: null,
  send_to_discord: true,
  send_to_telegram: true,
};

function readingTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default function AdminNewsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const [news, setNews]     = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  const [modalOpen, setModalOpen]     = useState(false);
  const [editItem, setEditItem]       = useState<NewsItem | null>(null);
  const [form, setForm]               = useState<NewsFormData>(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<NewsItem | null>(null);
  const [previewTab, setPreviewTab]   = useState<"markdown" | "discord" | "telegram">("markdown");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || user?.role !== "admin") { router.replace("/"); return; }
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
      publish_at: item.publish_at ? new Date(item.publish_at).toISOString().slice(0, 16) : null,
      send_to_discord: false,
      send_to_telegram: false,
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditItem(null); setFormError(""); };

  const insertAtCursor = (before: string, after = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const selected = form.content.slice(start, end);
    setField("content", form.content.slice(0, start) + before + selected + after + form.content.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) { setFormError("Title and content are required"); return; }
    setSaving(true);
    setFormError("");
    try {
      const payload: NewsFormData = { ...form, title: form.title.trim(), content: form.content.trim(), publish_at: form.publish_at || null };
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
    } finally {
      setDeleteConfirm(null);
    }
  };

  const duplicateItem = (item: NewsItem) => {
    setEditItem(null);
    setForm({ title: `${item.title} (copy)`, content: item.content, image_url: item.image_url ?? "", tags: item.tags ?? "", pinned: false, published: false, publish_at: null });
    setFormError("");
    setModalOpen(true);
  };

  const togglePin = async (item: NewsItem) => {
    try {
      const updated = await api.updateNews(item.id, { title: item.title, content: item.content, image_url: item.image_url ?? "", tags: item.tags ?? "", pinned: !item.pinned, published: item.published, publish_at: item.publish_at ?? null });
      setNews((prev) => prev.map((n) => (n.id === item.id ? updated : n)));
    } catch { /* ignore */ }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground";

  const toolbar: { label: string; title: string; before: string; after: string; cls?: string }[] = [
    { label: "B",   title: "Bold",       before: "**",   after: "**",     cls: "font-bold" },
    { label: "I",   title: "Italic",     before: "*",    after: "*",      cls: "italic" },
    { label: "H2",  title: "Heading 2",  before: "## ",  after: "",       cls: "font-semibold" },
    { label: "H3",  title: "Heading 3",  before: "### ", after: "",       cls: "font-semibold" },
    { label: "🔗",  title: "Link",       before: "[",    after: "](url)" },
    { label: "—",   title: "List item",  before: "- ",   after: "" },
    { label: "`·`", title: "Code",       before: "`",    after: "`",      cls: "font-mono text-[10px]" },
    { label: "❝",   title: "Blockquote", before: "> ",   after: "" },
    { label: "🖼",  title: "Image",      before: "![",   after: "](url)" },
  ];

  const tagPills = (form.tags ?? "").split(",").map(s => s.trim()).filter(Boolean);

  // Stats
  const publishedCount = news.filter(n => n.published).length;
  const draftCount     = news.filter(n => !n.published && !n.publish_at).length;
  const scheduledCount = news.filter(n => !n.published && !!n.publish_at).length;

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
          <>
            {/* Stats bar */}
            <div className="flex items-center gap-2.5 text-xs mb-5 px-1 flex-wrap">
              <span className="font-semibold text-foreground">{news.length} статей</span>
              <span className="w-px h-3 bg-white/15" />
              <span className="text-neon-green">{publishedCount} опубл.</span>
              {draftCount > 0 && (
                <>
                  <span className="w-px h-3 bg-white/15" />
                  <span className="text-yellow-400">{draftCount} черн.</span>
                </>
              )}
              {scheduledCount > 0 && (
                <>
                  <span className="w-px h-3 bg-white/15" />
                  <span className="text-blue-400">{scheduledCount} запл.</span>
                </>
              )}
            </div>

            {/* News list */}
            <div className="flex flex-col gap-3">
              {news.map((item) => {
                const isScheduled = !item.published && item.publish_at;
                const rt = readingTime(item.content);
                return (
                  <div
                    key={item.id}
                    className={`glass-card rounded-2xl p-4 flex gap-3 items-start border border-white/[0.06] hover:border-white/[0.14] transition-all ${
                      item.pinned ? "border-l-[3px] border-l-neon-green/60" : ""
                    }`}
                  >
                    {/* Thumbnail */}
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-xl object-cover flex-shrink-0 self-start"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="font-semibold text-sm text-foreground leading-snug mb-1.5 pr-1">
                        {item.title}
                      </h3>

                      {/* Metadata row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {item.pinned && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-neon-green/10 text-neon-green border border-neon-green/20 leading-none">
                            📌 {t.newsPinned}
                          </span>
                        )}
                        {!item.published && !isScheduled && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 leading-none">
                            {t.newsDraft}
                          </span>
                        )}
                        {isScheduled && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-400/10 text-blue-400 border border-blue-400/20 leading-none">
                            🕒 {t.newsScheduled}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/60">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                        {item.author_name && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
                            <User className="w-3 h-3" />
                            {item.author_name}
                          </span>
                        )}
                        {item.views > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
                            <Eye className="w-3 h-3" />
                            {item.views}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/40">
                          <Clock className="w-3 h-3" />
                          {rt} мин
                        </span>
                      </div>

                      {/* Preview */}
                      <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2 whitespace-pre-wrap">
                        {item.content}
                      </p>

                      {/* Tags */}
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

                    {/* Actions */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
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
                        onClick={() => duplicateItem(item)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-neon-purple hover:bg-neon-purple/10 transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
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
          </>
        )}
      </main>

      {/* Delete confirm */}
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

      {/* Editor modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-5xl glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <h2 className="font-bold text-base">
                {editItem ? `✏️ ${t.newsEdit}` : t.newsAdd}
              </h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-white/5 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Two-column layout */}
            <form
              onSubmit={handleSave}
              className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:flex md:flex-row"
            >
              {/* ── Left sidebar: form metadata ── */}
              <div className="md:w-72 flex-shrink-0 md:overflow-y-auto border-b md:border-b-0 md:border-r border-white/10 p-5 flex flex-col gap-4">
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
                      className="mt-1 rounded-xl object-cover w-full aspect-video"
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

                {/* Pinned + Published */}
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => setField("pinned", e.target.checked)}
                      className="w-4 h-4 rounded accent-green-400"
                    />
                    <span className="text-sm text-foreground">📌 {t.newsPinned}</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.published}
                      onChange={(e) => setField("published", e.target.checked)}
                      className="w-4 h-4 rounded accent-green-400"
                    />
                    <span className="text-sm text-foreground">{t.newsPublished}</span>
                  </label>
                </div>

                {/* Notification toggles */}
                {form.published && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Уведомления</label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setField("send_to_discord", !(form.send_to_discord ?? true))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          (form.send_to_discord ?? true)
                            ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                            : "bg-white/5 border-white/10 text-muted-foreground"
                        }`}
                      >
                        <DiscordIcon size={13} /> Discord
                      </button>
                      <button
                        type="button"
                        onClick={() => setField("send_to_telegram", !(form.send_to_telegram ?? true))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          (form.send_to_telegram ?? true)
                            ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                            : "bg-white/5 border-white/10 text-muted-foreground"
                        }`}
                      >
                        <TelegramIcon size={13} /> Telegram
                      </button>
                    </div>
                  </div>
                )}

                {/* Publish At (only when draft) */}
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

                {/* Actions — stick to bottom on desktop */}
                <div className="flex gap-2 md:mt-auto pt-1">
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
              </div>

              {/* ── Right: editor + preview ── */}
              <div className="flex-1 md:overflow-y-auto flex flex-col gap-4 p-5">
                {/* Content label + char count */}
                <div className="flex items-center justify-between flex-shrink-0">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">{t.newsContent}</label>
                  <span className={`text-xs ${form.content.length > 4000 ? "text-red-400" : "text-muted-foreground/40"}`}>
                    {form.content.length}
                  </span>
                </div>

                {/* Toolbar + textarea */}
                <div className="flex flex-col">
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
                  </div>
                  <textarea
                    ref={textareaRef}
                    className="w-full bg-white/5 border border-white/10 rounded-b-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 transition-all placeholder:text-muted-foreground resize-none font-mono leading-relaxed"
                    rows={12}
                    placeholder={t.newsContentPlaceholder}
                    value={form.content}
                    onChange={(e) => setField("content", e.target.value)}
                  />
                </div>

                {/* Preview */}
                <div className="flex flex-col border border-white/10 rounded-xl overflow-hidden min-h-[14rem]">
                  <div className="flex items-center gap-0.5 bg-white/5 border-b border-white/10 px-2 py-1.5 flex-shrink-0">
                    {(
                      [
                        { id: "markdown", label: "Preview" },
                        { id: "discord",  label: <span className="inline-flex items-center gap-1"><DiscordIcon size={12} /> Discord</span> },
                        { id: "telegram", label: <span className="inline-flex items-center gap-1"><TelegramIcon size={12} /> Telegram</span> },
                      ] as { id: typeof previewTab; label: ReactNode }[]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPreviewTab(tab.id)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                          previewTab === tab.id
                            ? "bg-white/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {previewTab === "markdown" && (
                      <div
                        className="px-4 py-3 text-sm text-foreground"
                        dangerouslySetInnerHTML={{
                          __html: form.content
                            ? renderMarkdown(form.content)
                            : `<span style="color:rgba(255,255,255,.25)">${t.newsContentPlaceholder}</span>`,
                        }}
                      />
                    )}
                    {previewTab === "discord"  && <DiscordNewsPreview  form={form} />}
                    {previewTab === "telegram" && <TelegramNewsPreview form={form} />}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
