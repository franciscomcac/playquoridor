// Small self-contained solo-puzzle board used on the matchmaking radar
// screen after the queue takes longer than a few seconds. Generated
// deterministically per mount so it feels fresh but stays cheap.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuoridorBoard } from "@/components/QuoridorBoard";
import { applyMove, goalsFor, reachedGoal, type GameState, type Move } from "@/lib/quoridor";
import {
  generatePuzzle,
  buildPuzzleGameState,
  seedFromString,
  type GeneratedPuzzle,
} from "@/lib/puzzleGen";
import { pickBotMove } from "@/lib/bot";
import { play } from "@/lib/sound";

export function QueuePuzzle() {
  const [seed, setSeed] = useState(() => seedFromString(`q:${Date.now()}:${Math.random()}`));
  const puzzle: GeneratedPuzzle = useMemo(() => generatePuzzle(seed, 2), [seed]);
  const [state, setState] = useState<GameState>(() => buildPuzzleGameState(puzzle));
  const [status, setStatus] = useState<"playing" | "solved" | "failed">("playing");
  const you = 0 as const;
  const opp = 1 as const;
  const goals = goalsFor(state.mode);
  const yourGoal = goals[you];
  const oppGoal = goals[opp];
  const busy = useRef(false);

  useEffect(() => {
    if (status !== "playing") return;
    if (state.turn !== opp) return;
    if (busy.current) return;
    busy.current = true;
    const t = window.setTimeout(() => {
      const bot = pickBotMove(state, opp, 1);
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
    }, 500);
    return () => {
      window.clearTimeout(t);
      busy.current = false;
    };
  }, [state, status, oppGoal]);

  const onMove = useCallback(
    (m: Move) => {
      if (status !== "playing") return;
      if (state.turn !== you) return;
      const next = applyMove(state, you, m);
      if (!next) {
        play("denied");
        return;
      }
      setState(next);
      play("pop");
      if (m.kind === "pawn" && reachedGoal(m.to, yourGoal)) {
        setStatus("solved");
        window.setTimeout(() => play("roundWin"), 120);
      }
    },
    [state, status, yourGoal],
  );

  const reset = () => {
    setState(buildPuzzleGameState(puzzle));
    setStatus("playing");
    busy.current = false;
  };
  const nextPuzzle = () => {
    const s = seedFromString(`q:${Date.now()}:${Math.random()}`);
    setSeed(s);
    const p = generatePuzzle(s, 2);
    setState(buildPuzzleGameState(p));
    setStatus("playing");
    busy.current = false;
  };

  const wallsLeft = state.wallsLeft[you] ?? 0;

  return (
    <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400">
            While you wait
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">Race puzzle — beat the bot</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Walls</p>
          <p className="text-xl font-semibold text-zinc-100">{wallsLeft}</p>
        </div>
      </div>
      <div className="relative">
        <QuoridorBoard
          state={state}
          you={you}
          onMove={onMove}
          interactive={status === "playing" && state.turn === you}
        />
        {status !== "playing" && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4 text-center">
              <p className="text-lg font-semibold text-zinc-100">
                {status === "solved" ? "You won the race" : "Bot got there first"}
              </p>
              <p className="text-xs text-zinc-500">
                {status === "solved" ? "Nice wall play." : "Try placing walls sooner."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                >
                  Retry
                </button>
                <button
                  onClick={nextPuzzle}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:brightness-110"
                >
                  New puzzle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Place walls to slow the bot. Race to row 1.</span>
        <button
          onClick={nextPuzzle}
          className="uppercase tracking-widest text-zinc-400 hover:text-zinc-200"
        >
          New
        </button>
      </div>
    </div>
  );
}
