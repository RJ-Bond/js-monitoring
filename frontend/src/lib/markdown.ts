/**
 * Lightweight markdown → HTML renderer (no external deps).
 * HTML-escapes content first to prevent XSS.
 */
export function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 style="font-size:.9rem;font-weight:700;color:#e2e8f0;margin:20px 0 6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.06)">$1</h3>',
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 style="font-size:1rem;font-weight:700;color:#f1f5f9;margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)">$1</h2>',
  );

  // List items (wrapped later)
  html = html.replace(
    /^[-*] (.+)$/gm,
    '<li style="margin:4px 0 4px 1.6em;list-style-type:disc;color:rgba(255,255,255,.8)">$1</li>',
  );

  // Inline: code span
  html = html.replace(
    /`(.+?)`/g,
    '<code style="font-family:monospace;font-size:.85em;background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px;color:#00ff88">$1</code>',
  );

  // Inline: bold, italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em style='color:rgba(255,255,255,.75)'>$1</em>");

  // Horizontal rule
  html = html.replace(
    /^---$/gm,
    '<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:16px 0" />',
  );

  // Links
  html = html.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" style="color:#00d4ff;text-decoration:underline;text-underline-offset:3px" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Paragraph wrapping
  html = html
    .split("\n\n")
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (/^<(h[23]|li|hr)/.test(t)) return t;
      return `<p style="margin:0 0 10px;line-height:1.7;color:rgba(255,255,255,.82)">${t.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

/** Strip markdown syntax, leaving plain text for previews */
export function stripMarkdown(s: string): string {
  return s
    .replace(/#{1,6} /g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*] /gm, "• ")
    .replace(/---/g, "")
    .trim();
}
