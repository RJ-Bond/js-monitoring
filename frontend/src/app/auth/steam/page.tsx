"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SteamAuthPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    const errorParam = params.get("error");

    if (errorParam === "banned") {
      router.replace("/login?error=banned");
      return;
    }

    if (!token) {
      router.replace("/login?error=steam_failed");
      return;
    }

    // Decode JWT payload to get user info (no signature verification needed here)
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as {
        sub: number;
        username: string;
        role: "admin" | "user";
      };
      login(token, {
        id: payload.sub,
        username: payload.username,
        email: "",
        role: payload.role,
        banned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      router.replace("/");
    } catch {
      router.replace("/login?error=steam_failed");
    }
  }, [params, login, router]);

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="w-12 h-12 bg-neon-green/20 border border-neon-green/40 rounded-2xl flex items-center justify-center animate-pulse">
          <Gamepad2 className="w-6 h-6 text-neon-green" />
        </div>
        <p className="text-sm">Completing Steam sign-in…</p>
      </div>
    </div>
  );
}
