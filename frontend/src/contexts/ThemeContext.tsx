"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("jsmon-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else {
      // Read admin default theme from cookie (set by SiteSettingsContext)
      let dt = "dark";
      for (const c of document.cookie.split(";")) {
        const trimmed = c.trim();
        if (trimmed.startsWith("jsmon-dt=")) { dt = trimmed.slice(9); break; }
      }
      const t: Theme = dt === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : dt === "light" ? "light" : "dark";
      setTheme(t);
      document.documentElement.className = t;
    }
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("jsmon-theme", next);
      document.documentElement.className = next;
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
