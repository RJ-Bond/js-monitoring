"use client";

import { useState } from "react";
import { GAME_META, steamIconUrl } from "@/lib/utils";
import type { GameType } from "@/types/server";

interface GameIconProps {
  gameType: GameType;
  /** CSS class for the Steam <img> element */
  imgClassName?: string;
  /** CSS class for the emoji <span> fallback */
  emojiClassName?: string;
}

/**
 * Displays a Steam CDN capsule image for games that have a Steam App ID,
 * falls back to an emoji for games without one (Minecraft, generic Source, etc.).
 * Automatically falls back to emoji on image load error.
 */
export default function GameIcon({
  gameType,
  imgClassName = "h-5 w-auto max-w-[3rem] object-contain rounded-sm",
  emojiClassName = "text-lg leading-none",
}: GameIconProps) {
  const meta = GAME_META[gameType];
  const [failed, setFailed] = useState(false);

  if (meta?.steamAppId && !failed) {
    return (
      <img
        src={steamIconUrl(meta.steamAppId)}
        alt={meta.label}
        className={imgClassName}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={emojiClassName} aria-label={meta?.label ?? gameType}>
      {meta?.icon ?? "🖥️"}
    </span>
  );
}
