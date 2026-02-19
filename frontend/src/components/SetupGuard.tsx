"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";

const SKIP_PATHS = ["/setup", "/login", "/register", "/auth"];

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Не проверяем на страницах, где guard не нужен
    if (SKIP_PATHS.some((p) => pathname.startsWith(p))) return;

    api.setupStatus()
      .then(({ needed }) => {
        if (needed) router.replace("/setup");
      })
      .catch(() => {
        // Игнорируем ошибки — не блокируем загрузку
      });
  }, [pathname, router]);

  return <>{children}</>;
}
