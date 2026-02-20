import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/providers/QueryProvider";
import { SetupGuard } from "@/components/SetupGuard";
import { SiteSettingsProvider } from "@/contexts/SiteSettingsContext";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "JS Monitor — Game Server Dashboard",
  description: "High-End Game Server Monitoring Dashboard",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className={`${inter.className} antialiased min-h-screen bg-background`}>
        <QueryProvider>
          <SiteSettingsProvider>
            <SetupGuard>{children}</SetupGuard>
          </SiteSettingsProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
