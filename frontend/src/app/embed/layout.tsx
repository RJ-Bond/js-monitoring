import type { ReactNode } from "react";

// Минимальный layout без nav/footer для встраиваемого виджета
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </head>
      <body style={{ margin: 0, background: "transparent" }}>
        {children}
      </body>
    </html>
  );
}
