import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PLAYER_COLORS, QuoridorBoard } from "@/components/QuoridorBoard";
import {
  applyMove, goalsFor, reachedGoal,
  type GameState, type Move, type Pos, type Wall,
} from "@/lib/quoridor";
import { pickBotMove } from "@/lib/bot";
import { play } from "@/lib/sound";
import { buildPuzzleGameState, generatePuzzle, seedFromString, type GeneratedPuzzle } from "@/lib/puzzleGen";

const SITE_URL = "https://playquoridor.online";
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

type PuzzleEntry = GeneratedPuzzle & { difficulty: 1 | 2 | 3; label: string };

export const Route = createFileRoute("/puzzle/$date")({
  head: ({ params }) => {
    const title = `Daily Quoridor Race Puzzles — ${params.date}`;
    const description =
      `Three daily Quoridor race puzzles: place walls to slow your opponent and win the race to the far row. Play free at playquoridor.online — no login required.`;
    const url = `${SITE_URL}/puzzle/${params.date}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PuzzlePage,
});

function PuzzlePage() {
  const { date } = Route.useParams();
  if (!DATE_RX.test(date)) throw notFound();

  const puzzles = useMemo<PuzzleEntry[]>(() => {
    const diffs: Array<{ label: string; d: 1 | 2 | 3 }> = [
      { label: "Easy", d: 1 },
      { label: "Medium", d: 2 },
      { label: "Hard", d: 3 },
    ];
    return diffs.map(({ label, d }, i) => {
      const gen = generatePuzzle(seedFromString(`quoridor:${date}:${i}`), d);
      return { ...gen, id: `${date}-${i}`, title: `${label} — Puzzle ${i + 1}`, difficulty: d, label };
    });
  }, [date]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => [false, false, false]);
  const puzzle = puzzles[activeIdx];
  const markSolved = useCallback((i: number) => {
    setSolved((s) => { if (s[i]) return s; const n = [...s]; n[i] = true; return n; });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav className="flex items-center justify-between text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">← Back to game</Link>
        <span className="tracking-widest uppercase">Daily Race Puzzles</span>
      </nav>

      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{date}</p>
        <h1 className="text-3xl sm:text-4xl">{puzzle.title}</h1>
        <p className="text-sm text-muted-foreground">
          Race your opponent to the far row. You have <span className="font-semibold text-foreground">{puzzle.playerWalls}</span> wall{puzzle.playerWalls === 1 ? "" : "s"} to slow them down. Reach row 1 before they reach row 9.
        </p>
      </header>

      <div className="flex gap-2">
        {puzzles.map((p, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={p.id}
              onClick={() => setActiveIdx(i)}
              className={
                "flex-1 rounded-xl border px-3 py-2 text-left transition " +
                (active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-secondary/40")
              }
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Puzzle {i + 1}</span>
                {solved[i] && <span className="text-emerald-500">✓ Solved</span>}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {p.label}
              </div>
              <div className="text-[11px] text-muted-foreground">{p.playerWalls} wall{p.playerWalls === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      <PuzzleBoard puzzle={puzzle} key={puzzle.id} onSolved={() => markSolved(activeIdx)} />
    </main>
  );
}

function PuzzleBoard({ puzzle, onSolved }: { puzzle: PuzzleEntry; onSolved: () => void }) {
  const you = 0 as const;
  const opp = 1 as const;
  const [initial] = useState<GameState>(() => buildPuzzleGameState(puzzle));
  const [state, setState] = useState<GameState>(initial);
  const [status, setStatus] = useState<"playing" | "solved" | "failed">("playing");
  const busy = useRef(false);

  const goals = goalsFor(state.mode);
  const yourGoal = goals[you];
  const oppGoal = goals[opp];

  // Opponent auto-plays whenever it's their turn.
  useEffect(() => {
    if (status !== "playing") return;
    if (state.turn !== opp) return;
    if (busy.current) return;
    busy.current = true;
    const t = window.setTimeout(() => {
      const bot = pickBotMove(state, opp, 1); // pure shortest-path (no walls left)
      busy.current = false;
      if (!bot) return;
      const next = applyMove(state, opp, bot);
      if (!next) return;
      setState(next);
      play("pop");
      if (bot.kind === "pawn" && reachedGoal(bot.to, oppGoal)) {
        setStatus("failed");
        window.setTimeout(() => play("denied"), 120);
      }
    }, 550);
    return () => { window.clearTimeout(t); busy.current = false; };
  }, [state, status, oppGoal]);

  const onMove = useCallback((m: Move) => {
    if (status !== "playing") return;
    if (state.turn !== you) return;
    const next = applyMove(state, you, m);
    if (!next) { play("denied"); return; }
    setState(next);
    play(m.kind === "wall" ? "pop" : "pop");
    if (m.kind === "pawn" && reachedGoal(m.to, yourGoal)) {
      setStatus("solved");
      onSolved();
      window.setTimeout(() => play("roundWin"), 120);
    }
  }, [state, status, yourGoal, onSolved]);

  const reset = () => {
    setState(initial); setStatus("playing"); busy.current = false;
  };

  const wallsLeft = state.wallsLeft[you] ?? 0;
  const oppTurn = state.turn === opp && status === "playing";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Your walls</p>
            <p className="text-2xl font-semibold">{wallsLeft}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Turn</p>
            <p className={"text-sm font-semibold " + (oppTurn ? "text-destructive" : "text-emerald-500")}>
              {oppTurn ? "Opponent…" : "You"}
            </p>
          </div>
        </div>
        <button
          onClick={reset}
          className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
        >
          Reset
        </button>
      </div>

      <div className="wood-frame relative">
        <QuoridorBoard state={state} you={you} onMove={onMove} interactive={status === "playing" && state.turn === you} />
        {status !== "playing" && (
          <PuzzleOverlay
            solved={status === "solved"}
            you={you}
            onReset={reset}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        You are player 1 (bottom). Place walls to slow the opponent and race them to your goal row. Opponent auto-plays the shortest path — they cannot place walls.
      </p>
    </div>
  );
}

function PuzzleOverlay({ solved, you, onReset }: {
  solved: boolean; you: number; onReset: () => void;
}) {
  const color = PLAYER_COLORS[you];
  const title = solved ? "You won the race" : "Opponent got there first";
  const sub = solved
    ? "Your wall timing paid off. Try the next difficulty."
    : "Try placing walls earlier — force the opponent onto a longer path.";
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Daily Quoridor Puzzle", url: shareUrl }); return; } catch { /* fall through */ } }
    try { await navigator.clipboard.writeText(shareUrl); } catch { /* ignore */ }
  };
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
      <div className="results-in mx-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6 text-center shadow-2xl">
        <span className="grid h-14 w-14 place-items-center rounded-full text-xl font-semibold"
          style={{ background: color, color: "oklch(0.15 0.02 55)", boxShadow: `0 0 26px color-mix(in oklab, ${color} 60%, transparent)` }}>
          {you + 1}
        </span>
        <p className="text-2xl">{title}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button onClick={onReset} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5 transition-transform">
            Try again
          </button>
          <button onClick={share} className="rounded-lg border border-border bg-accent/70 px-5 py-2 text-sm font-medium">
            Share
          </button>
          <Link to="/" className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}