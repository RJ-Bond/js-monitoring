"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Terminal, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface RconConsoleProps {
  serverId: number;
  serverTitle: string;
  apiKey: string;
  onClose: () => void;
}

interface LogLine {
  type: "input" | "output" | "system";
  text: string;
}

const WS_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_WS_URL ??
        `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`)
    : "";

export default function RconConsole({ serverId, serverTitle, apiKey, onClose }: RconConsoleProps) {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<LogLine[]>([{ type: "system", text: `Connecting to ${serverTitle}…` }]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: LogLine["type"], text: string) => {
    setLogs((prev) => [...prev, { type, text }]);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/v1/rcon?key=${apiKey}`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ server_id: serverId }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, string>;
        if (msg.status === "connected") { setConnected(true); addLog("system", `✅ Connected to ${msg.server}`); }
        else if (msg.output) addLog("output", msg.output);
        else if (msg.error) addLog("system", `❌ ${msg.error}`);
      } catch { addLog("output", event.data as string); }
    };
    ws.onclose = () => { setConnected(false); addLog("system", "Connection closed."); };
    ws.onerror = () => addLog("system", "WebSocket error.");
    return () => ws.close();
  }, [serverId, apiKey, addLog]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const sendCommand = () => {
    const cmd = input.trim();
    if (!cmd || !connected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ command: cmd }));
    addLog("input", `> ${cmd}`);
    setInput("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl glass-card rounded-xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-neon-green" />
            <span className="text-sm font-semibold text-neon-green">{serverTitle}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full", connected ? "bg-neon-green/20 text-neon-green" : "bg-red-500/20 text-red-400")}>
              {connected ? t.rconConnected : t.rconConnecting}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="terminal h-80 overflow-y-auto p-4 space-y-1 font-mono text-sm">
          {logs.map((line, i) => (
            <div key={i} className={cn("leading-relaxed", line.type === "input" && "text-neon-blue", line.type === "output" && "text-green-300", line.type === "system" && "text-muted-foreground italic")}>
              {line.text}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-black/40">
          <span className="text-neon-green font-mono text-sm">{">"}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCommand()}
            disabled={!connected}
            placeholder={connected ? t.rconEnterCommand : t.rconWaiting}
            className="flex-1 bg-transparent text-foreground text-sm font-mono outline-none placeholder:text-muted-foreground disabled:opacity-40"
            autoFocus
          />
          <button onClick={sendCommand} disabled={!connected || !input.trim()} className="text-neon-green hover:text-neon-green/70 transition-colors disabled:opacity-30">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
