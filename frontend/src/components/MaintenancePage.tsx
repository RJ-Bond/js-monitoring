"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  const [lang, setLang] = useState<"ru" | "en">("ru");

  const t = {
    ru: {
      title: "Техническое обслуживание",
      subtitle: "Сайт временно недоступен.\nМы уже работаем над этим — зайдите позже.",
      toggle: "EN",
    },
    en: {
      title: "Under Maintenance",
      subtitle: "The site is temporarily unavailable.\nWe're working on it — please check back later.",
      toggle: "RU",
    },
  }[lang];

  return (
    <div className="min-h-screen bg-background bg-grid flex flex-col items-center justify-center gap-6 px-4">
      <div className="glass-card rounded-3xl p-10 flex flex-col items-center gap-5 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 flex items-center justify-center">
          <Wrench className="w-8 h-8 text-yellow-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{t.subtitle}</p>
        <button
          onClick={() => setLang((l) => (l === "ru" ? "en" : "ru"))}
          className="mt-2 px-4 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
        >
          {t.toggle}
        </button>
      </div>
    </div>
  );
}
