// Small, purely-presentational widgets that render around the game board:
// wall reserves, the AFK countdown, the chaos-mode ribbon, the event log,
// and the shared match footer. All extracted from src/routes/game.tsx to
// keep the route file focused on state.
import { useEffect, useState } from "react";
import type { PlayerId } from "@/lib/quoridor";

export type EventEntry = { key: number; text: string };

export function WallCounter({ count, color }: { count: number; color: string }) {
  const shown = Math.min(count, 10);
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="block h-3 w-1.5 rounded-sm" style={{ background: i < shown ? color : "var(--border)" }} />
      ))}
      {count > 10 && <span className="ml-1 text-[10px] text-muted-foreground">+{count - 10}</span>}
    </div>
  );
}

export function AfkBanner({ deadline, name }: { slot: PlayerId; deadline: number; name: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, []);
  const remain = Math.max(0, deadline - now);
  const mm = Math.floor(remain / 60000);
  const ss = Math.floor((remain % 60000) / 1000).toString().padStart(2, "0");
  return (
    <div className="afk-pulse rounded-xl border px-4 py-2 text-sm font-medium"
      style={{ borderColor: "var(--destructive)", color: "var(--destructive)", background: "oklch(0.6 0.2 25 / 0.08)" }}>
      {name} is AFK — forfeiting in {mm}:{ss}
    </div>
  );
}

export function ChaosBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-600/25 via-rose-600/20 to-amber-500/20 px-4 py-2.5 shadow-lg shadow-fuchsia-900/30">
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-fuchsia-500/10 to-transparent" />
      <div className="relative flex items-center gap-3">
        <span className="text-lg">⚡</span>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-300">Chaos Mode</p>
          <p className="text-xs font-semibold text-white">4 players. One board. All bets are off.</p>
        </div>
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">FFA</span>
      </div>
    </div>
  );
}

export function EventLog({ entries }: { entries: EventEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Log</p>
      <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
        {entries.slice().reverse().map((e) => (<li key={e.key}>· {e.text}</li>))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="pt-6 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
      Peer-to-peer · no accounts · your browser only
    </footer>
  );
}