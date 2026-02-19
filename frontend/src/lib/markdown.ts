/**
 * Lightweight markdown → HTML renderer (no external deps).
 * HTML-escapes content first to prevent XSS.
 */
export function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:.95rem;font-weight:700;margin:12px 0 4px">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.05rem;font-weight:700;margin:16px 0 6px">$1</h2>');
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:1.4em;list-style-type:disc">$1</li>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" style="color:#38bdf8;text-decoration:underline" target="_blank" rel="noopener noreferrer">$1</a>',
  );

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
