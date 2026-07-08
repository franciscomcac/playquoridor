import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isMatchSnapshot, type MatchSnapshot } from "@/lib/matchHistory";
import { drawState, replay, PLAYER_HEX } from "@/lib/matchReplay";
import { renderMatchGif, downloadBlob } from "@/lib/gifExport";
import { pickBotMove } from "@/lib/bot";
import {
  BOARD, goalsFor, isBlocked, reachedGoal,
  type Goal, type GameState, type Move, type PlayerId, type Pos, type Wall,
} from "@/lib/quoridor";
import { explainMove } from "@/lib/analysis.functions";

export const Route = createFileRoute("/analyze/$clipId")({
  head: () => ({
    meta: [
      { title: "Analyze game · playquoridor.online" },
      { name: "description", content: "Move-by-move engine analysis of a Quoridor game." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyzePage,
  notFoundComponent: () => <Shell><p className="text-rose-400">Clip not found.</p></Shell>,
  errorComponent: () => <Shell><p className="text-rose-400">Failed to load clip.</p></Shell>,
});

function bfsDist(from: Pos, goal: Goal, walls: Wall[]): number {
  if (reachedGoal(from, goal)) return 0;
  const seen = new Uint8Array(BOARD * BOARD);
  seen[from[0] * BOARD + from[1]] = 1;
  const q: Array<[number, number, number]> = [[from[0], from[1], 0]];
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (q.length) {
    const [r, c, d] = q.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= BOARD || nc < 0 || nc >= BOARD) continue;
      const idx = nr * BOARD + nc;
      if (seen[idx]) continue;
      if (isBlocked(r, c, nr, nc, walls)) continue;
      if (reachedGoal([nr, nc], goal)) return d + 1;
      seen[idx] = 1;
      q.push([nr, nc, d + 1]);
    }
  }
  return 99;
}

type Verdict = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

function verdictFor(delta: number): Verdict {
  if (delta <= 0) return "best";
  if (delta <= 1) return "good";
  if (delta <= 2) return "inaccuracy";
  if (delta <= 4) return "mistake";
  return "blunder";
}

const VERDICT_COLOR: Record<Verdict, string> = {
  best: "text-emerald-400 border-emerald-400/50 bg-emerald-500/10",
  good: "text-lime-400 border-lime-400/50 bg-lime-500/10",
  inaccuracy: "text-amber-400 border-amber-400/50 bg-amber-500/10",
  mistake: "text-orange-400 border-orange-400/50 bg-orange-500/10",
  blunder: "text-rose-400 border-rose-400/50 bg-rose-500/10",
};

function moveText(m: Move): string {
  if (m.kind === "pawn") {
    const files = "abcdefghi";
    return `${files[m.to[1]]}${9 - m.to[0]}`;
  }
  return `wall ${m.wall.o.toUpperCase()} @ ${"abcdefghi"[m.wall.c]}${9 - m.wall.r}`;
}

function AnalyzePage() {
  const { clipId } = useParams({ from: "/analyze/$clipId" });
  const nav = useNavigate();
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        if (clipId === "local") {
          const raw = sessionStorage.getItem("analyze:pending");
          if (!raw) { setError("No local analysis pending. Finish a match and click Analyze."); return; }
          const parsed = JSON.parse(raw);
          if (!isMatchSnapshot(parsed)) { setError("Local clip is in an old format."); return; }
          setSnapshot(parsed);
        } else {
          const { data } = await supabase.from("saved_clips")
            .select("snapshot").eq("id", clipId).maybeSingle();
          if (!data) { setError("Clip not found."); return; }
          if (!isMatchSnapshot(data.snapshot)) { setError("This clip was saved in an old format and can't be analyzed."); return; }
          setSnapshot(data.snapshot);
        }
      } finally { setLoading(false); }
    })();
  }, [clipId]);

  const frames = useMemo(() => (snapshot ? replay(snapshot) : []), [snapshot]);
  const analyses = useMemo(() => {
    if (!snapshot) return [];
    // For each ply, compare the actual move to the engine's best pick from
    // the state BEFORE the move. Verdict = extra steps the mover's shortest
    // path grew vs the engine's pick (a wall the mover placed that doesn't
    // slow the opponent still counts as extra distance because gain = 0).
    const goals = goalsFor(snapshot.mode);
    return frames.map((f, i) => {
      if (f.plyIndex < 0) return null;
      const prev = frames[i - 1]?.state;
      if (!prev || f.by === null) return null;
      const my = f.by as PlayerId;
      const oppSlot = ((my + 1) % snapshot.mode) as PlayerId;
      const actual = snapshot.rounds[f.roundIndex].moves[f.plyIndex].move;
      const best = pickBotMove(prev, my, 0.95) ?? actual;

      const score = (s: GameState) => {
        const d = bfsDist(s.pawns[my], goals[my], s.walls);
        const o = bfsDist(s.pawns[oppSlot], goals[oppSlot], s.walls);
        return o - d; // higher = better for `my`
      };
      const applyLocal = (base: GameState, mv: Move): GameState => {
        if (mv.kind === "pawn") {
          const pawns = base.pawns.map((p, k) => (k === my ? mv.to : p));
          return { ...base, pawns };
        }
        return { ...base, walls: [...base.walls, { ...mv.wall, by: my }] };
      };
      const sActual = score(applyLocal(prev, actual));
      const sBest = score(applyLocal(prev, best));
      const delta = Math.max(0, sBest - sActual);
      return {
        verdict: verdictFor(delta),
        actual, best, delta,
        distMe: bfsDist(prev.pawns[my], goals[my], prev.walls),
        distOpp: bfsDist(prev.pawns[oppSlot], goals[oppSlot], prev.walls),
        distMeAfter: bfsDist(f.state.pawns[my], goals[my], f.state.walls),
        distOppAfter: bfsDist(f.state.pawns[oppSlot], goals[oppSlot], f.state.walls),
      };
    });
  }, [snapshot, frames]);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [snapshot]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setIdx((i) => {
        if (i >= frames.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 550);
    return () => window.clearInterval(t);
  }, [playing, frames.length]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c || !frames[idx]) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    drawState(ctx, frames[idx].state, c.width, c.height);
  }, [idx, frames]);

  const [busyGif, setBusyGif] = useState(false);
  const downloadGif = async () => {
    if (!snapshot) return;
    setBusyGif(true);
    try {
      const blob = await renderMatchGif(snapshot);
      downloadBlob(blob, `quoridor-${new Date().toISOString().slice(0, 10)}.gif`);
    } finally { setBusyGif(false); }
  };

  if (loading) return <Shell><p className="text-zinc-500">Loading…</p></Shell>;
  if (error) return (
    <Shell>
      <p className="text-rose-400">{error}</p>
      <button onClick={() => nav({ to: "/" })} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm">Back home</button>
    </Shell>
  );
  if (!snapshot) return null;

  const cur = frames[idx];
  const curAnalysis = analyses[idx];

  return (
    <Shell>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Game analysis</h1>
          <p className="text-xs text-zinc-500">
            {snapshot.rounds.length} round{snapshot.rounds.length === 1 ? "" : "s"} ·
            {" "}winner: {snapshot.matchWinner !== null ? snapshot.playerNames[snapshot.matchWinner] : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadGif} disabled={busyGif}
            className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-60">
            {busyGif ? "Rendering GIF…" : "Download GIF"}
          </button>
          <Link to="/clips" className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
            My clips
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <canvas ref={canvasRef} width={340} height={340} className="w-full max-w-[340px]" />
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
              className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40">◀</button>
            <button onClick={() => setPlaying((p) => !p)}
              className="rounded-md border border-border px-3 py-1 text-xs">{playing ? "Pause" : "Play"}</button>
            <button onClick={() => setIdx((i) => Math.min(frames.length - 1, i + 1))} disabled={idx >= frames.length - 1}
              className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40">▶</button>
            <span className="ml-auto text-[11px] text-zinc-500">
              {idx + 1} / {frames.length}
            </span>
          </div>
          <input type="range" min={0} max={frames.length - 1} value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="mt-3 w-full accent-[color:var(--primary)]" />
          {cur && curAnalysis && cur.by !== null && (
            <MoveCard snapshot={snapshot} slot={cur.by} analysis={curAnalysis} actual={curAnalysis.actual} />
          )}
        </div>

        <ol className="max-h-[70vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2">
          {frames.map((f, i) => {
            const a = analyses[i];
            if (f.plyIndex < 0) return (
              <li key={i} className="mt-2 text-[10px] uppercase tracking-widest text-zinc-500">
                — Round {f.roundIndex + 1} —
              </li>
            );
            if (!a || f.by === null) return null;
            const name = snapshot.playerNames[f.by];
            return (
              <li key={i}>
                <button onClick={() => setIdx(i)}
                  className={"my-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs " +
                    (i === idx ? "bg-primary/15 text-foreground" : "hover:bg-secondary/40")}>
                  <span className="w-6 text-right text-[10px] text-zinc-500">{f.plyIndex + 1}.</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: PLAYER_HEX[f.by] }} />
                  <span className="w-16 truncate">{name}</span>
                  <span className="flex-1 font-mono">{moveText(a.actual)}</span>
                  <span className={"rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest " + VERDICT_COLOR[a.verdict]}>
                    {a.verdict}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Shell>
  );
}

function MoveCard({ snapshot, slot, analysis, actual }: {
  snapshot: MatchSnapshot; slot: PlayerId;
  analysis: NonNullable<ReturnType<typeof pickBotMove> extends null ? never : {
    verdict: Verdict; actual: Move; best: Move; delta: number;
    distMe: number; distOpp: number; distMeAfter: number; distOppAfter: number;
  }>;
  actual: Move;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = useServerFn(explainMove);
  const explain = async () => {
    setBusy(true);
    try {
      const r = await call({
        data: {
          fenLike: `mode=${snapshot.mode} round=${snapshot.rounds.length}`,
          moveText: moveText(actual),
          playerLabel: snapshot.playerNames[slot],
          distMe: analysis.distMe, distOpp: analysis.distOpp,
          distMeAfter: analysis.distMeAfter, distOppAfter: analysis.distOppAfter,
          bestMoveText: moveText(analysis.best),
          verdict: analysis.verdict,
        },
      });
      setNote(r.text);
    } catch (e) {
      setNote("Couldn't reach the coach. Try again in a moment.");
      console.warn(e);
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs">
          <span className="text-muted-foreground">Played:</span>{" "}
          <span className="font-mono">{moveText(actual)}</span>
        </p>
        <span className={"rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest " + VERDICT_COLOR[analysis.verdict]}>
          {analysis.verdict}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Engine suggested <span className="font-mono text-foreground">{moveText(analysis.best)}</span> · path {analysis.distMe}→{analysis.distMeAfter} · opp {analysis.distOpp}→{analysis.distOppAfter}
      </p>
      <div className="mt-2">
        <button onClick={explain} disabled={busy}
          className="rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-60">
          {busy ? "Thinking…" : note ? "Re-explain" : "Explain with AI"}
        </button>
        {note && <p className="mt-2 text-xs italic text-foreground">{note}</p>}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <Link to="/" className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300">← Home</Link>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}