"use client";

import { useLanguage } from "@/contexts/LanguageContext";

interface BulkActionBarProps {
  selectedCount: number;
  actions: { label: string; value: string; danger?: boolean }[];
  onAction: (action: string) => void;
  onClear: () => void;
}

export default function BulkActionBar({ selectedCount, actions, onAction, onClear }: BulkActionBarProps) {
  const { t } = useLanguage();
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up w-[calc(100%-2rem)] max-w-xl">
      <div className="glass-card rounded-2xl px-3 sm:px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3 border border-neon-blue/20 shadow-lg shadow-black/40">
        <span className="text-sm font-semibold text-neon-blue whitespace-nowrap">{t.bulkSelected(selectedCount)}</span>
        <div className="hidden sm:block h-4 w-px bg-white/20 flex-shrink-0" />
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 flex-1">
          {actions.map((a) => (
            <button
              key={a.value}
              onClick={() => onAction(a.value)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                a.danger
                  ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  : "bg-white/10 text-foreground hover:bg-white/20"
              }`}
            >
              {a.label}
            </button>
          ))}
          <button onClick={onClear} className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors">
            {t.bulkCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
