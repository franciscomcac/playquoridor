// Small self-contained solo-puzzle board used on the matchmaking radar
// screen after the queue takes longer than a few seconds. Generated
// deterministically per mount so it feels fresh but stays cheap.
import { useCallback, useMemo, useState } from "react";
import { QuoridorBoard } from "@/components/QuoridorBoard";
import { applyMove, goalsFor, reachedGoal, type GameState, type Move } from "@/lib/quoridor";
import { generatePuzzle, buildPuzzleGameState, seedFromString, type GeneratedPuzzle } from "@/lib/puzzleGen";
import { play } from "@/lib/sound";

export function QueuePuzzle() {
  const [seed, setSeed] = useState(() => seedFromString(`q:${Date.now()}:${Math.random()}`));
  const puzzle: GeneratedPuzzle = useMemo(() => generatePuzzle(seed, 2), [seed]);
  const [state, setState] = useState<GameState>(() => buildPuzzleGameState(puzzle));
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState<"playing" | "solved" | "failed">("playing");
  const you = 0 as const;
  const goal = goalsFor(state.mode)[you];

  const onMove = useCallback((m: Move) => {
    if (status !== "playing") return;
    if (m.kind !== "pawn") { play("denied"); return; }
    const next = applyMove(state, you, m);
    if (!next) { play("denied"); return; }
    const forced: GameState = { ...next, turn: you, winner: null, active: state.active };
    const n = moves + 1;
    setMoves(n); setState(forced); play("pop");
    if (reachedGoal(m.to, goal)) { setStatus("solved"); window.setTimeout(() => play("roundWin"), 120); }
    else if (n >= puzzle.goal_moves) setStatus("failed");
  }, [state, moves, puzzle.goal_moves, goal, status]);

  const reset = () => {
    setState(buildPuzzleGameState(puzzle));
    setMoves(0); setStatus("playing");
  };
  const nextPuzzle = () => {
    const s = seedFromString(`q:${Date.now()}:${Math.random()}`);
    setSeed(s);
    // Rebuild off the fresh puzzle in the same tick.
    const p = generatePuzzle(s, 2);
    setState(buildPuzzleGameState(p));
    setMoves(0); setStatus("playing");
  };

  const left = Math.max(0, puzzle.goal_moves - moves);
  const danger = left <= 2 && status === "playing";

  return (
    <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400">While you wait</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">Solo warm-up puzzle</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Moves</p>
          <p className={"text-xl font-semibold " + (danger ? "text-red-400" : "text-zinc-100")}>
            {moves}<span className="text-sm text-zinc-500"> / {puzzle.goal_moves}</span>
          </p>
        </div>
      </div>
      <div className="relative">
        <QuoridorBoard state={state} you={you} onMove={onMove} interactive={status === "playing"} />
        {status !== "playing" && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4 text-center">
              <p className="text-lg font-semibold text-zinc-100">
                {status === "solved" ? "Solved" : "Out of moves"}
              </p>
              <p className="text-xs text-zinc-500">
                {status === "solved" ? `Reached the goal in ${moves} move${moves === 1 ? "" : "s"}.` : "Try a different route."}
              </p>
              <div className="flex gap-2">
                <button onClick={reset} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800">Retry</button>
                <button onClick={nextPuzzle} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:brightness-110">New puzzle</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Reach row 1 in {puzzle.goal_moves} moves or fewer.</span>
        <button onClick={nextPuzzle} className="uppercase tracking-widest text-zinc-400 hover:text-zinc-200">New</button>
      </div>
    </div>
  );
}