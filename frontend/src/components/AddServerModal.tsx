"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useCreateServer } from "@/hooks/useServers";
import type { GameType } from "@/types/server";

interface AddServerModalProps {
  onClose: () => void;
}

export default function AddServerModal({ onClose }: AddServerModalProps) {
  const { mutate: createServer, isPending } = useCreateServer();
  const [form, setForm] = useState({
    title: "",
    ip: "",
    port: "27015",
    game_type: "source" as GameType,
    secret_rcon_key: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.title || !form.ip) {
      setError("Title and IP are required");
      return;
    }

    createServer(
      { ...form, port: Number(form.port) },
      {
        onSuccess: onClose,
        onError: (err) => setError(err.message),
      }
    );
  };

  const field =
    "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-neon-green/50 focus:bg-white/8 transition-all placeholder:text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-bold text-base">Add Server</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Server Name *
            </label>
            <input
              className={field}
              placeholder="My Awesome Server"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">
                IP / Host *
              </label>
              <input
                className={field}
                placeholder="192.168.1.1"
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">
                Port
              </label>
              <input
                className={field}
                placeholder="27015"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                type="number"
                min={1}
                max={65535}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Game Type
            </label>
            <select
              className={`${field} cursor-pointer`}
              value={form.game_type}
              onChange={(e) => setForm({ ...form, game_type: e.target.value as GameType })}
            >
              <option value="source">Source Engine (CS2, TF2, Rust…)</option>
              <option value="minecraft">Minecraft</option>
              <option value="fivem">FiveM / GTA V</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              RCON Password (optional)
            </label>
            <input
              className={field}
              placeholder="••••••••"
              type="password"
              value={form.secret_rcon_key}
              onChange={(e) => setForm({ ...form, secret_rcon_key: e.target.value })}
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neon-green text-black hover:bg-neon-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {isPending ? "Adding…" : "Add Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
