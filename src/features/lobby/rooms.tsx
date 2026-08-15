// Lobby room-setup screens: create a private room, join by code, or
// spectate an in-progress match. Extracted from src/routes/game.tsx.
import { useState } from "react";
import { makeRoomCode } from "@/lib/peer-room";
import type { Mode } from "@/lib/quoridor";

export function CreateRoom({
  mode,
  walls,
  rounds,
  setMode,
  setWalls,
  setRounds,
  onBack,
  onStart,
}: {
  mode: Mode;
  walls: number;
  rounds: number;
  setMode: (m: Mode) => void;
  setWalls: (n: number) => void;
  setRounds: (n: number) => void;
  onBack: () => void;
  onStart: (code: string) => void;
}) {
  const [code] = useState(() => makeRoomCode());
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  // Series length is fixed for every match: best of 3, first to 2, max 3 rounds.
  void rounds;
  void setRounds;
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button
        onClick={onBack}
        className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Create a room</h2>
      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Players</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[2, 4].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m as Mode)}
              className={
                "rounded-lg border px-4 py-3 text-sm font-medium " +
                (mode === m
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground")
              }
            >
              {m} Players
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <label className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Walls per player <span className="text-base font-semibold text-foreground">{walls}</span>
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={walls}
          onChange={(e) => setWalls(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--primary)]"
        />
      </div>
      <div className="mt-6 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
        <p className="text-[10px] uppercase tracking-[0.2em]">Format</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {mode === 4
            ? "4 players · first to 2 wins · max 5 rounds"
            : "Best of 3 · first to 2 · max 3 rounds"}
        </p>
      </div>
      <div className="mt-6 rounded-lg border border-dashed border-border bg-background/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Room code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-mono text-3xl tracking-[0.3em] text-primary">{code}</p>
          <button
            onClick={copy}
            className="rounded-md border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <button
        onClick={() => onStart(code)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
      >
        Open room →
      </button>
    </div>
  );
}

export function JoinRoom({
  onBack,
  onJoin,
}: {
  onBack: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const clean = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button
        onClick={onBack}
        className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Join a room</h2>
      <input
        value={clean}
        onChange={(e) => setCode(e.target.value)}
        placeholder="K7M2Q"
        autoFocus
        className="mt-6 w-full rounded-lg border border-border bg-background/40 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] text-primary focus:border-primary focus:outline-none"
      />
      <button
        disabled={clean.length !== 5}
        onClick={() => onJoin(clean)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Join →
      </button>
    </div>
  );
}

export function SpectateRoom({
  onBack,
  onJoin,
}: {
  onBack: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const clean = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button
        onClick={onBack}
        className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Spectate a match</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the code of a match already in progress. You'll watch the board update live — no seat,
        no wall placement, just the show.
      </p>
      <input
        value={clean}
        onChange={(e) => setCode(e.target.value)}
        placeholder="K7M2Q"
        autoFocus
        className="mt-6 w-full rounded-lg border border-border bg-background/40 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] text-primary focus:border-primary focus:outline-none"
      />
      <button
        disabled={clean.length !== 5}
        onClick={() => onJoin(clean)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Watch →
      </button>
    </div>
  );
}
