"use client";

import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error";
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<ToastItem>).detail;
      setToasts((prev) => [...prev, item]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== item.id)), 3500);
    };
    window.addEventListener("jsmon:toast", handler);
    return () => window.removeEventListener("jsmon:toast", handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-xs pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`glass-card rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 shadow-xl animate-fade-in border ${
            t.type === "error" ? "border-red-400/30" : "border-neon-green/30"
          }`}
        >
          {t.type === "error" ? (
            <X className="w-4 h-4 flex-shrink-0 text-red-400" />
          ) : (
            <Check className="w-4 h-4 flex-shrink-0 text-neon-green" />
          )}
          <span className="text-foreground">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
