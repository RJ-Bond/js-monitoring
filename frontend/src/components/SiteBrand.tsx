"use client";

import { Gamepad2 } from "lucide-react";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";

interface SiteBrandProps {
  size?: "sm" | "lg";
  /** Extra content after the name (e.g. "Admin Panel" label) */
  suffix?: React.ReactNode;
  className?: string;
}

export default function SiteBrand({ size = "sm", suffix, className = "" }: SiteBrandProps) {
  const { siteName, logoData } = useSiteSettings();

  const isDefault = siteName === "JSMonitor";

  const iconBox = size === "lg"
    ? "w-8 h-8 rounded-xl"
    : "w-6 h-6 rounded-lg";

  const iconSize = size === "lg"
    ? "w-4 h-4"
    : "w-3.5 h-3.5";

  const textSize = size === "lg"
    ? "text-lg"
    : "text-base";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`${iconBox} bg-neon-green/20 border border-neon-green/40 flex items-center justify-center flex-shrink-0`}>
        {logoData ? (
          <img src={logoData} alt="logo" className={`${iconSize} object-contain`} />
        ) : (
          <Gamepad2 className={`${iconSize} text-neon-green`} />
        )}
      </div>
      <span className={`font-black ${textSize} tracking-tight`}>
        {isDefault ? (
          <>JS<span className="text-neon-green">Monitor</span></>
        ) : (
          siteName
        )}
        {suffix}
      </span>
    </div>
  );
}
