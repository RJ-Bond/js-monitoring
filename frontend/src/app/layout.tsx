import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/providers/QueryProvider";
import { SetupGuard } from "@/components/SetupGuard";
import { SiteSettingsProvider } from "@/contexts/SiteSettingsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "JS Monitor — Game Server Dashboard",
  description: "High-End Game Server Monitoring Dashboard",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme — runs before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('jsmon-theme')||'dark';document.documentElement.className=t;})()`,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased min-h-screen bg-background`}>
        <QueryProvider>
          <ThemeProvider>
            <SiteSettingsProvider>
              <SetupGuard>{children}</SetupGuard>
            </SiteSettingsProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
