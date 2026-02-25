"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, type SiteSettings } from "@/lib/api";

interface SiteSettingsCtx {
  siteName: string;
  logoData: string;
  steamEnabled: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT: SiteSettingsCtx = {
  siteName: "JSMonitor",
  logoData: "",
  steamEnabled: false,
  refresh: async () => {},
};

const SiteSettingsContext = createContext<SiteSettingsCtx>(DEFAULT);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>({
    id: 1,
    site_name: "JSMonitor",
    logo_data: "",
    steam_enabled: false,
    app_url: "",
    registration_enabled: true,
    force_https: false,
  });

  const load = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (
      settings.force_https &&
      typeof window !== "undefined" &&
      window.location.protocol === "http:" &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ) {
      window.location.href = window.location.href.replace("http:", "https:");
    }
  }, [settings.force_https]);

  return (
    <SiteSettingsContext.Provider
      value={{
        siteName: settings.site_name,
        logoData: settings.logo_data,
        steamEnabled: settings.steam_enabled,
        refresh: load,
      }}
    >
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
