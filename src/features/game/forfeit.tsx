// Two-step forfeit confirmation and the resume-interrupted-match prompt.
// Extracted from src/routes/game.tsx.
import { useEffect, useRef, useState } from "react";
import type { SavedGame } from "@/lib/interruptedGame";

export function ForfeitButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  useEffect(() => { if (disabled) setArmed(false); }, [disabled]);
  const click = () => {
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setArmed(false);
    onConfirm();
  };
  return (
    <button
      onClick={click}
      disabled={disabled}
      className={
        "rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-widest transition-colors disabled:opacity-40 " +
        (armed ? "bg-[color:var(--destructive)] text-white hover:opacity-90" : "hover:bg-secondary/50")
      }
      style={armed ? { borderColor: "var(--destructive)" } : { borderColor: "var(--destructive)", color: "var(--destructive)" }}
    >
      {armed ? "Click again to confirm" : "Forfeit round"}
    </button>
  );
}

export function ResumeMatchPrompt({ game, onReturn, onAbort }: { game: SavedGame; onReturn: () => void; onAbort: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Interrupted match</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Return to game?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Room {game.code} is still reserved. Choose one action before continuing.
        </p>
        <div className="mt-6 grid gap-3">
          <button
            onClick={onReturn}
            autoFocus
            className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Return to game
          </button>
          <button
            onClick={onAbort}
            className="rounded-lg border border-border bg-secondary/30 px-5 py-3 text-sm font-semibold hover:bg-secondary"
          >
            Abort game
          </button>
        </div>
      </div>
    </div>
  );
}