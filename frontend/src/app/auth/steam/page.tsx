"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import SiteBrand from "@/components/SiteBrand";

function SteamCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    const errorParam = params.get("error");

    if (errorParam === "banned") { router.replace("/login?error=banned"); return; }
    if (!token) { router.replace("/login?error=steam_failed"); return; }

    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as {
        sub: number; username: string; role: "admin" | "user";
      };
      login(token, {
        id: payload.sub, username: payload.username, email: "",
        role: payload.role, banned: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      router.replace("/");
    } catch {
      router.replace("/login?error=steam_failed");
    }
  }, [params, login, router]);

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="animate-pulse">
          <SiteBrand size="lg" className="scale-150" />
        </div>
        <p className="text-sm">Completing Steam sign-in…</p>
      </div>
    </div>
  );
}

export default function SteamAuthPage() {
  return (
    <Suspense>
      <SteamCallback />
    </Suspense>
  );
}
