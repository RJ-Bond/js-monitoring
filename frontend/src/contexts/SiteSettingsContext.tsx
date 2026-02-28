"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, type SiteSettings } from "@/lib/api";

interface SiteSettingsCtx {
  siteName: string;
  logoData: string;
  steamEnabled: boolean;
  vRisingMapEnabled: boolean;
  vRisingMapURL: string;
  vRisingWorldXMin: number;
  vRisingWorldXMax: number;
  vRisingWorldZMin: number;
  vRisingWorldZMax: number;
  vRisingCastleIconURL: string;
  vRisingPlayerIconURL: string;
  refresh: () => Promise<void>;
}

const DEFAULT: SiteSettingsCtx = {
  siteName: "JSMonitor",
  logoData: "",
  steamEnabled: false,
  vRisingMapEnabled: true,
  vRisingMapURL: "",
  vRisingWorldXMin: -2880,
  vRisingWorldXMax: 160,
  vRisingWorldZMin: -2400,
  vRisingWorldZMax: 640,
  vRisingCastleIconURL: "",
  vRisingPlayerIconURL: "",
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
    default_theme: "dark",
    vrising_map_enabled: true,
    vrising_map_url: "",
    vrising_world_x_min: -2880,
    vrising_world_x_max: 160,
    vrising_world_z_min: -2400,
    vrising_world_z_max: 640,
    vrising_castle_icon_url: "",
    vrising_player_icon_url: "",
  });

  const load = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
      // Cache default theme in cookie so the FOUC script can read it on next load
      const dt = s.default_theme || "dark";
      document.cookie = `jsmon-dt=${dt};max-age=31536000;path=/`;
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
        vRisingMapEnabled: settings.vrising_map_enabled ?? true,
        vRisingMapURL: settings.vrising_map_url ?? "",
        vRisingWorldXMin: settings.vrising_world_x_min ?? -2880,
        vRisingWorldXMax: settings.vrising_world_x_max ?? 160,
        vRisingWorldZMin: settings.vrising_world_z_min ?? -2400,
        vRisingWorldZMax: settings.vrising_world_z_max ?? 640,
        vRisingCastleIconURL: settings.vrising_castle_icon_url ?? "",
        vRisingPlayerIconURL: settings.vrising_player_icon_url ?? "",
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
