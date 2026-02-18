"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translations, type Locale, type Translations } from "@/lib/translations";

interface LanguageContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "ru",
  t: translations.ru,
  setLocale: () => {},
});

const STORAGE_KEY = "jsmon-lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  // Загрузка из localStorage при монтировании
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved === "en" || saved === "ru") {
      setLocaleState(saved);
    }
  }, []);

  // Обновление <html lang=""> при смене языка
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
