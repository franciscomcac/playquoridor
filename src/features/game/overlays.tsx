// Full-viewport and in-board modal overlays used by the game screen.
// Extracted from src/routes/game.tsx for readability; behavior unchanged.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getVolume, isMuted, setMuted, setVolume } from "@/lib/sound";

export function AbortedOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm aborted-fade">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="aborted-ring relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-rose-500/60">
          <svg className="h-12 w-12 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="8" y1="8" x2="16" y2="16" />
          </svg>
        </div>
        <div className="aborted-text">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-rose-400">Match ended</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Game Aborted</h2>
          <p className="mt-2 text-sm text-zinc-400">Returning to lobby…</p>
        </div>
      </div>
    </div>
  );
}

export function WaitingOverlay({ count, expected, isHost, onStart }: { count: number; expected: number; isHost: boolean; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/60 backdrop-blur-[4px] overflow-hidden">
      {/* Sweeping radar glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, rgba(16,185,129,0) 0deg, rgba(16,185,129,0.18) 40deg, rgba(16,185,129,0) 80deg, rgba(16,185,129,0) 360deg)",
          animation: "wo-sweep 3.6s linear infinite",
          maskImage: "radial-gradient(circle at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 55%)",
          WebkitMaskImage: "radial-gradient(circle at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 55%)",
        }}
      />

      <div className="relative grid h-28 w-28 place-items-center">
        {/* Concentric ripples */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border border-emerald-400/60"
            style={{ animation: `wo-ripple 2.6s cubic-bezier(0,0.2,0.2,1) ${i * 0.86}s infinite` }}
          />
        ))}
        {/* Rotating dashed ring */}
        <span
          aria-hidden
          className="absolute inset-1 rounded-full border-2 border-dashed border-emerald-400/50"
          style={{ animation: "wo-spin 8s linear infinite" }}
        />
        {/* Orbiting pawn dots */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ animation: "wo-spin 3.2s linear infinite" }}
        >
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-emerald-400 shadow-[0_0_14px_3px_rgba(16,185,129,0.75)]" />
          <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-emerald-300/80 shadow-[0_0_10px_2px_rgba(16,185,129,0.5)]" />
        </span>
        {/* Center core */}
        <span
          className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-emerald-400/15"
          style={{ animation: "wo-pulse 1.6s ease-in-out infinite" }}
        >
          <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_18px_5px_rgba(16,185,129,0.75)]" />
        </span>
      </div>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.4em] text-emerald-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
        <span className="qm-dots">Waiting for players</span>
      </p>

      {/* Slot pips */}
      <div className="mt-3 flex items-center gap-2">
        {Array.from({ length: expected }, (_, i) => {
          const filled = i < count;
          return (
            <span
              key={i}
              className={
                "h-2.5 w-2.5 rounded-full transition-colors " +
                (filled
                  ? "bg-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.7)]"
                  : "border border-emerald-400/40 bg-transparent")
              }
              style={filled ? undefined : { animation: `wo-pulse 1.6s ease-in-out ${i * 0.18}s infinite` }}
            />
          );
        })}
      </div>
      <p className="mt-2 font-[IBM_Plex_Mono,monospace] text-[11px] text-zinc-300/85 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
        {count}/{expected} connected
      </p>
      {isHost && count >= 2 && count < expected && (
        <button onClick={onStart} className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-950 shadow-[0_15px_40px_-15px_rgba(16,185,129,0.7)] transition-transform hover:-translate-y-0.5">
          Start with {count}
        </button>
      )}
    </div>
  );
}

export function ErrorOverlay({ msg, onLeave }: { msg: string | null; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/90 p-6 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{msg ?? "Unknown error"}</p>
      <button onClick={onLeave} className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
        Back to menu
      </button>
    </div>
  );
}

export function MessageOverlay({ title, body, onLeave }: { title: string; body: string; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/85 p-6 text-center">
      <p className="text-2xl">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <button onClick={onLeave} className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
        Back to menu
      </button>
    </div>
  );
}

export function SignUpNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data.user;
      const anon = !u || u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
      setShow(anon);
    });
    return () => { alive = false; };
  }, []);
  if (!show) return null;
  return (
    <div className="mt-3 w-full max-w-md rounded-lg border border-border bg-secondary/30 px-4 py-3 text-center">
      <p className="text-sm font-semibold">Create a free account</p>
      <p className="mt-1 text-xs text-muted-foreground">Save your games, chat in-match, and get a rating.</p>
      <Link to="/auth"
        className="mt-2 inline-block rounded-md bg-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:-translate-y-0.5 transition-transform">
        Sign up
      </Link>
    </div>
  );
}

export function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const [muted, setMutedS] = useState(isMuted());
  const [vol, setVolS] = useState(getVolume());
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Settings</h2>
          <button onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Close</button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <label className="text-sm">Mute all sounds</label>
          <input type="checkbox" checked={muted} onChange={(e) => { setMutedS(e.target.checked); setMuted(e.target.checked); }} />
        </div>
        <div className="mt-4">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Master volume</label>
          <input type="range" min={0} max={1} step={0.05} value={vol}
            onChange={(e) => { const v = Number(e.target.value); setVolS(v); setVolume(v); }}
            className="mt-2 w-full accent-[color:var(--primary)]" />
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Sounds initialize on your first click and are stored in this browser.
        </p>
      </div>
    </div>
  );
}