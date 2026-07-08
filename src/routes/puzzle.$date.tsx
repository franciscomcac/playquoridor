import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { PLAYER_COLORS, QuoridorBoard } from "@/components/QuoridorBoard";
import {
  applyMove, defaultWallsFor, goalsFor, reachedGoal,
  type GameState, type Move, type Pos, type Wall,
} from "@/lib/quoridor";
import { play } from "@/lib/sound";
import { generatePuzzle, seedFromString } from "@/lib/puzzleGen";

const SITE_URL = "https://playquoridor.online";
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

type PuzzleRow = {
  id: string;
  puzzle_date: string;
  title: string;
  mode: number;
  pawns: Pos[];
  walls: Wall[];
  active_player: number;
  goal_moves: number;
  difficulty: 1 | 2 | 3;
};

export const Route = createFileRoute("/puzzle/$date")({
  head: ({ params }) => {
    const title = `Daily Quoridor Puzzle — ${params.date}`;
    const description =
      `Solve today's daily Quoridor puzzle. A fixed board position with a target number of moves. Play free at playquoridor.online — no login required.`;
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

  const puzzles = useMemo<PuzzleRow[]>(() => {
    const diffs: Array<{ label: string; d: 1 | 2 | 3 }> = [
      { label: "Easy", d: 1 },
      { label: "Medium", d: 2 },
      { label: "Hard", d: 3 },
    ];
    return diffs.map(({ label, d }, i) => {
      const gen = generatePuzzle(seedFromString(`quoridor:${date}:${i}`), d);
      return {
        id: `${date}-${i}`,
        puzzle_date: date,
        title: `${label} — Puzzle ${i + 1}`,
        mode: gen.mode,
        pawns: gen.pawns,
        walls: gen.walls,
        active_player: gen.active_player,
        goal_moves: gen.goal_moves,
        difficulty: d,
      };
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
        <span className="tracking-widest uppercase">Daily Puzzles</span>
      </nav>

      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{date}</p>
        <h1 className="text-3xl sm:text-4xl">{puzzle.title}</h1>
        <p className="text-sm text-muted-foreground">
          Reach your goal row in <span className="font-semibold text-foreground">{puzzle.goal_moves}</span> moves or fewer.
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
                {["Easy", "Medium", "Hard"][i]}
              </div>
              <div className="text-[11px] text-muted-foreground">{p.goal_moves} moves</div>
            </button>
          );
        })}
      </div>

      <PuzzleBoard puzzle={puzzle} key={puzzle.id} onSolved={() => markSolved(activeIdx)} />
    </main>
  );
}

function buildPuzzleState(p: PuzzleRow): GameState {
  const mode = (p.mode === 4 ? 4 : 2) as 2 | 4;
  const pawns = p.pawns.map((pp) => [pp[0], pp[1]] as Pos);
  return {
    mode,
    pawns,
    active: Array.from({ length: mode }, () => true),
    leftMatch: Array.from({ length: mode }, () => false),
    wallsLeft: Array.from({ length: mode }, () => 0), // no wall placement in puzzles
    walls: p.walls.map((w) => ({ r: w.r, c: w.c, o: w.o, by: (w.by ?? 1) as 0 | 1 | 2 | 3 })),
    lastWall: null,
    turn: (p.active_player as 0 | 1 | 2 | 3) ?? 0,
    winner: null,
    totalWalls: defaultWallsFor(mode),
    score: Array.from({ length: mode }, () => 0),
    totalRounds: 1,
    matchWinner: null,
    wallsPlacedByPlayer: Array.from({ length: mode }, () => 0),
    pawnsEliminatedByPlayer: Array.from({ length: mode }, () => 0),
    moveCount: 0,
  };
}

function PuzzleBoard({ puzzle, onSolved }: { puzzle: PuzzleRow; onSolved: () => void }) {
  const you = (puzzle.active_player as 0 | 1 | 2 | 3) ?? 0;
  const [initial] = useState<GameState>(() => buildPuzzleState(puzzle));
  const [state, setState] = useState<GameState>(initial);
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState<"playing" | "solved" | "failed">("playing");

  const goal = goalsFor(state.mode)[you];

  const onMove = useCallback((m: Move) => {
    if (status !== "playing") return;
    if (m.kind !== "pawn") { play("denied"); return; }
    const next = applyMove(state, you, m);
    if (!next) { play("denied"); return; }
    // Puzzle: only the player moves — force turn back to them and clear any
    // engine-set winner (we track puzzle completion ourselves).
    const forced: GameState = { ...next, turn: you, winner: null, active: state.active };
    const newMoves = moves + 1;
    setMoves(newMoves);
    setState(forced);
    play("pop");
    if (reachedGoal(m.to, goal)) {
      setStatus("solved");
      onSolved();
      window.setTimeout(() => play("roundWin"), 120);
    } else if (newMoves >= puzzle.goal_moves) {
      setStatus("failed");
    }
  }, [state, you, moves, puzzle.goal_moves, goal, status, onSolved]);

  const reset = () => {
    setState(initial); setMoves(0); setStatus("playing");
  };

  const movesLeft = Math.max(0, puzzle.goal_moves - moves);
  const dangerMoves = movesLeft <= 2 && status === "playing";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Moves</span>
          <span className={"text-2xl font-semibold " + (dangerMoves ? "text-destructive" : "text-foreground")}>
            {moves}
          </span>
          <span className="text-sm text-muted-foreground">/ {puzzle.goal_moves}</span>
        </div>
        <button
          onClick={reset}
          className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
        >
          Reset
        </button>
      </div>

      <div className="wood-frame relative">
        <QuoridorBoard state={state} you={you} onMove={onMove} interactive={status === "playing"} />
        {status !== "playing" && (
          <PuzzleOverlay
            solved={status === "solved"}
            moves={moves}
            goal={puzzle.goal_moves}
            you={you}
            onReset={reset}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Puzzle rules: you control the highlighted pawn. Reach your goal row in the target number of moves. Walls are fixed for this puzzle.
      </p>
    </div>
  );
}

function PuzzleOverlay({ solved, moves, goal, you, onReset }: {
  solved: boolean; moves: number; goal: number; you: number; onReset: () => void;
}) {
  const color = PLAYER_COLORS[you];
  const title = solved ? "Puzzle solved" : "Out of moves";
  const sub = solved
    ? `Reached the goal in ${moves} move${moves === 1 ? "" : "s"} (target ${goal}).`
    : `You ran out of moves before reaching the goal. Try a different route.`;
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