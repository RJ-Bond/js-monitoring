"use client";

import { useState, useEffect } from "react";

const KEY = "jsmon-favorites";

export function useFavorites() {
  const [favorites, setFavorites] = useState<number[]>([]);

  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      setFavorites([]);
    }
  }, []);

  const toggle = (id: number) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return { favorites, toggle };
}
