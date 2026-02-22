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
      const sys: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      setTheme(sys);
      document.documentElement.className = sys;
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
