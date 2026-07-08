import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();

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
  const [transition, setTransition] = useState<null | "solved-flash" | "advancing" | "all-done">(null);
  const puzzle = puzzles[activeIdx];
  const markSolved = useCallback((i: number) => {
    setSolved((s) => {
      if (s[i]) return s;
      const n = [...s]; n[i] = true;
      const isLast = i === 2 || n.every(Boolean);
      // Flash "solved" then either advance or show completion.
      setTransition("solved-flash");
      window.setTimeout(() => {
        if (isLast) {
          setTransition("all-done");
        } else {
          setTransition("advancing");
          window.setTimeout(() => {
            setActiveIdx((idx) => Math.min(2, idx + 1));
            setTransition(null);
          }, 550);
        }
      }, 900);
      return n;
    });
  }, []);

  const allDone = transition === "all-done";
  const solvedCount = solved.filter(Boolean).length;

  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col gap-3 overflow-hidden px-4 py-3 sm:gap-4 sm:px-6 sm:py-5">
      <nav className="flex flex-none items-center justify-between text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">← Back to game</Link>
        <span className="tracking-widest uppercase">Daily Race Puzzles</span>
      </nav>

      <header className="flex-none">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{date}</p>
            <h1 className="text-lg font-semibold sm:text-2xl">{puzzle.title}</h1>
          </div>
          <ProgressPips solved={solved} active={activeIdx} />
        </div>
      </header>

      <div className="flex flex-none gap-2">
        {puzzles.map((p, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={p.id}
              onClick={() => { if (!transition) setActiveIdx(i); }}
              disabled={!!transition}
              className={
                "flex-1 rounded-xl border px-3 py-1.5 text-left transition disabled:opacity-60 " +
                (active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-secondary/40")
              }
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Puzzle {i + 1}</span>
                {solved[i] && <span className="text-emerald-500">✓ Solved</span>}
              </div>
              <div className="text-sm font-semibold">{p.label}</div>
            </button>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={"h-full transition-all duration-500 " + (transition === "advancing" ? "-translate-x-6 opacity-0" : "opacity-100")}>
          <PuzzleBoard puzzle={puzzle} key={puzzle.id} onSolved={() => markSolved(activeIdx)} />
        </div>
        {transition === "solved-flash" && (
          <SolvedFlash index={activeIdx + 1} total={3} />
        )}
        {allDone && (
          <AllDoneOverlay
            solvedCount={solvedCount}
            onLobby={() => navigate({ to: "/" })}
            onCasual={() => {
              try { sessionStorage.setItem("quoridor:pendingAction", "quick2"); } catch { /* noop */ }
              void navigate({ to: "/game" });
            }}
          />
        )}
      </div>
    </main>
  );
}

function ProgressPips({ solved, active }: { solved: boolean[]; active: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {solved.map((s, i) => (
        <span key={i}
          className={
            "h-2.5 w-2.5 rounded-full transition-all " +
            (s
              ? "bg-emerald-500 shadow-[0_0_10px_rgba(47,213,117,0.6)]"
              : i === active
                ? "bg-primary/70 scale-125"
                : "bg-border")
          }
          aria-label={s ? "solved" : i === active ? "current" : "todo"}
        />
      ))}
      <span className="ml-1 font-mono text-[11px] text-muted-foreground">
        {solved.filter(Boolean).length}/3
      </span>
    </div>
  );
}

function SolvedFlash({ index, total }: { index: number; total: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="animate-scale-in rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-8 py-6 text-center shadow-[0_0_60px_rgba(47,213,117,0.35)] backdrop-blur-sm">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-emerald-300">
          {index}/{total} solved
        </div>
        <div className="mt-1 text-3xl font-bold text-emerald-300">
          {index < total ? "Nice — next puzzle" : "All three solved"}
        </div>
      </div>
    </div>
  );
}

function AllDoneOverlay({ solvedCount, onLobby, onCasual }: {
  solvedCount: number; onLobby: () => void; onCasual: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-background/85 backdrop-blur-sm animate-fade-in">
      <div className="animate-scale-in mx-4 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-emerald-500/40 bg-card px-8 py-7 text-center shadow-2xl">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-3xl">
          🏆
        </div>
        <p className="text-2xl font-bold">Daily set complete</p>
        <p className="text-sm text-muted-foreground">
          You cleared {solvedCount}/3 puzzles today. Come back tomorrow for a new set.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            onClick={onCasual}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5 transition-transform"
          >
            Play a casual 1v1
          </button>
          <button
            onClick={onLobby}
            className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary"
          >
            Back to lobby
          </button>
        </div>
      </div>
    </div>
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
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Your walls</p>
            <p className="text-xl font-semibold leading-none">{wallsLeft}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Turn</p>
            <p className={"text-sm font-semibold leading-none " + (oppTurn ? "text-destructive" : "text-emerald-500")}>
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

      <div className="relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="wood-frame relative aspect-square h-full max-h-full w-auto max-w-full">
          <QuoridorBoard state={state} you={you} onMove={onMove} interactive={status === "playing" && state.turn === you} />
          {status === "failed" && (
            <PuzzleOverlay
              solved={false}
              you={you}
              onReset={reset}
            />
          )}
        </div>
      </div>
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