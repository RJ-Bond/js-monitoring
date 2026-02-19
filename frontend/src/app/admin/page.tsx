"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Ban, Crown, UserX, RefreshCw, Gamepad2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { User } from "@/types/server";

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/");
      return;
    }
    fetchUsers();
  }, [isAuthenticated, isLoading, user, router]);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.adminGetUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (id: number, data: { role?: string; banned?: boolean }) => {
    try {
      const updated = await api.adminUpdateUser(id, data);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const deleteUser = async (u: User) => {
    if (!confirm(t.adminConfirmDelete(u.username))) return;
    try {
      await api.adminDeleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-neon-green/20 border border-neon-green/40 rounded-xl flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-neon-green" />
            </div>
            <span className="font-black text-lg tracking-tight">
              JS<span className="text-neon-green">Monitor</span>
              <span className="ml-2 text-sm font-medium text-muted-foreground">{t.adminPanel}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button onClick={fetchUsers} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
            <a href="/" className="px-3 py-2 rounded-xl text-xs font-medium border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground transition-all">
              {t.adminBackToPanel}
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-neon-green" />
          <h2 className="text-lg font-bold">{t.adminUsers}</h2>
          <span className="text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded-lg">{users.length}</span>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : users.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">{t.adminNoUsers}</div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-3">{t.adminUsername}</th>
                    <th className="text-left px-5 py-3 hidden sm:table-cell">{t.adminEmail}</th>
                    <th className="text-left px-5 py-3">{t.adminRole}</th>
                    <th className="text-left px-5 py-3">{t.adminStatus}</th>
                    <th className="text-left px-5 py-3 hidden md:table-cell">{t.adminCreated}</th>
                    <th className="text-right px-5 py-3">{t.adminActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {u.role === "admin" && <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                          <span className="font-medium truncate max-w-[120px]">{u.username}</span>
                          {u.steam_id && <span title="Steam" className="text-xs text-muted-foreground">🎮</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[180px]">
                        {u.email || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${u.role === "admin" ? "bg-yellow-400/10 text-yellow-400" : "bg-white/5 text-muted-foreground"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${u.banned ? "bg-red-400/10 text-red-400" : "bg-neon-green/10 text-neon-green"}`}>
                          {u.banned ? t.adminBanned : t.adminActive}
                        </span>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        {/* Don't show actions for current admin's own row */}
                        {u.id !== user?.id && (
                          <div className="flex items-center justify-end gap-1">
                            {/* Ban / Unban */}
                            <button
                              onClick={() => updateUser(u.id, { banned: !u.banned })}
                              title={u.banned ? t.adminUnban : t.adminBan}
                              className={`p-1.5 rounded-lg transition-colors ${u.banned ? "text-neon-green hover:bg-neon-green/10" : "text-red-400 hover:bg-red-400/10"}`}
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                            {/* Promote / Demote */}
                            <button
                              onClick={() => updateUser(u.id, { role: u.role === "admin" ? "user" : "admin" })}
                              title={u.role === "admin" ? t.adminMakeUser : t.adminMakeAdmin}
                              className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                            >
                              <Crown className="w-4 h-4" />
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => deleteUser(u)}
                              title={t.adminDelete}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
