"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface StatusIndicatorProps {
  online: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const sizeMap = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3.5 h-3.5",
};

export default function StatusIndicator({
  online,
  size = "md",
  showLabel = false,
}: StatusIndicatorProps) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "rounded-full status-dot flex-shrink-0",
          sizeMap[size],
          online ? "status-dot-online" : "status-dot-offline"
        )}
      />
      {showLabel && (
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-widest",
            online ? "text-neon-green" : "text-neon-red"
          )}
        >
          {online ? t.statusOnline : t.statusOffline}
        </span>
      )}
    </div>
  );
}
