"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import type { Locale } from "@/lib/translations";
import { cn } from "@/lib/utils";

const LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: "en", label: "EN", flag: "🇺🇸" },
  { value: "ru", label: "RU", flag: "🇷🇺" },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-1">
      {LOCALES.map((l) => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
            locale === l.value
              ? "bg-neon-green/20 text-neon-green border border-neon-green/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>{l.flag}</span>{l.label}
        </button>
      ))}
    </div>
  );
}
