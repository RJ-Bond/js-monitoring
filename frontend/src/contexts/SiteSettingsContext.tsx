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
