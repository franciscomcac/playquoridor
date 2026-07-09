import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isMatchSnapshot, type MatchSnapshot } from "@/lib/matchHistory";
import { drawState, replay, PLAYER_HEX } from "@/lib/matchReplay";
import { ExportClipModal } from "@/components/ExportClipModal";
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

// Tag chip styles matching the uploaded redesign — solid color + soft tint.
const VERDICT_CHIP: Record<Verdict, string> = {
  best:       "text-emerald-300 border-emerald-400/40 bg-emerald-500/10",
  good:       "text-lime-300    border-lime-400/40    bg-lime-500/10",
  inaccuracy: "text-amber-300   border-amber-400/40   bg-amber-500/10",
  mistake:    "text-orange-300  border-orange-400/40  bg-orange-500/10",
  blunder:    "text-rose-300    border-rose-400/40    bg-rose-500/10",
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
  const [flipped, setFlipped] = useState(false);

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
  const [speed, setSpeed] = useState<"slow" | "med" | "fast">("med");
  const speedMs = speed === "slow" ? 1100 : speed === "fast" ? 220 : 550;
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setIdx((i) => {
        if (i >= frames.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, speedMs);
    return () => window.clearInterval(t);
  }, [playing, frames.length, speedMs]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c || !frames[idx]) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    drawState(ctx, frames[idx].state, c.width, c.height);
  }, [idx, frames]);

  const [exportOpen, setExportOpen] = useState(false);

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
  const winnerName = snapshot.matchWinner !== null ? snapshot.playerNames[snapshot.matchWinner] : "—";

  // Group frames by round so the move list can render "ROUND N" dividers.
  type ListRow = { kind: "divider"; roundIndex: number } | { kind: "move"; i: number };
  const listRows: ListRow[] = [];
  {
    let lastRound = -1;
    frames.forEach((f, i) => {
      if (f.plyIndex < 0) {
        listRows.push({ kind: "divider", roundIndex: f.roundIndex });
        lastRound = f.roundIndex;
      } else {
        if (f.roundIndex !== lastRound) {
          listRows.push({ kind: "divider", roundIndex: f.roundIndex });
          lastRound = f.roundIndex;
        }
        listRows.push({ kind: "move", i });
      }
    });
  }

  return (
    <Shell>
      {/* Ambient glow accents */}
      <div aria-hidden className="pointer-events-none absolute -top-40 right-[-15%] -z-10 h-[600px] w-[820px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle at 70% 20%, color-mix(in oklch, " + PLAYER_HEX[1] + " 20%, transparent), transparent 60%)" }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[-25%] left-[-12%] -z-10 h-[560px] w-[680px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle at 30% 80%, color-mix(in oklch, " + PLAYER_HEX[0] + " 16%, transparent), transparent 60%)" }} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Game analysis</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {snapshot.rounds.length} round{snapshot.rounds.length === 1 ? "" : "s"} · winner:{" "}
            <b className="font-semibold" style={{ color: PLAYER_HEX[snapshot.matchWinner ?? 0] }}>{winnerName}</b>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFlipped((f) => !f)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.07]">
            Flip sides {flipped ? "↺" : "⇅"}
          </button>
          <button onClick={() => setExportOpen(true)} disabled={!snapshot}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-60">
            Download clip
          </button>
          <Link to="/clips"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:brightness-110"
            style={{ background: PLAYER_HEX[0], color: "#1a1002" }}>
            My clips
          </Link>
        </div>
        <ExportClipModal open={exportOpen} snapshot={snapshot} onClose={() => setExportOpen(false)} />
      </div>

      <div className="mt-4 grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,520px)_1fr] lg:overflow-hidden">
        {/* Board + transport card */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.035] to-white/[0.015] p-3 backdrop-blur lg:h-full lg:overflow-hidden">
          <div className="relative mx-auto aspect-square w-full max-w-[480px] overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12]">
            <canvas ref={canvasRef} width={720} height={720}
              className="absolute inset-0 h-full w-full transition-transform duration-500"
              style={{ transform: flipped ? "rotate(180deg)" : undefined }} />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} disabled={idx === 0}
              aria-label="Previous move"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-100 transition hover:bg-white/[0.08] disabled:opacity-40">◀</button>
            <button onClick={() => setPlaying((p) => !p)}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.1]">
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button onClick={() => { setPlaying(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }} disabled={idx >= frames.length - 1}
              aria-label="Next move"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-100 transition hover:bg-white/[0.08] disabled:opacity-40">▶</button>
            <div className="ml-1 min-w-[64px] text-right font-mono text-xs text-zinc-500">
              {idx + 1} / {frames.length}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Speed</span>
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {(["slow", "med", "fast"] as const).map((s) => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={"rounded-md px-2.5 py-1 text-[11px] font-semibold transition " +
                    (speed === s
                      ? "text-[#1a1002]"
                      : "text-zinc-500 hover:text-zinc-200")}
                  style={speed === s ? { background: PLAYER_HEX[0] } : undefined}>
                  {s === "med" ? "medium" : s}
                </button>
              ))}
            </div>
          </div>

          <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={idx}
            onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
            className="analyze-scrub mt-2 w-full"
            style={{ ["--scrub-accent" as string]: PLAYER_HEX[0] }} />

          {cur && curAnalysis && cur.by !== null && (
            <MoveCard snapshot={snapshot} slot={cur.by} analysis={curAnalysis} actual={curAnalysis.actual} />
          )}
        </section>

        {/* Move list card + AI coach overlay */}
        <section className="relative flex min-h-0 flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.035] to-white/[0.015] backdrop-blur lg:h-full lg:overflow-hidden">
          <CoachPanel
            key={"coach-" + idx}
            snapshot={snapshot}
            frame={cur ?? null}
            analysis={curAnalysis ?? null}
          />
          <MoveList
            listRows={listRows}
            frames={frames}
            analyses={analyses}
            snapshot={snapshot}
            activeIdx={idx}
            onPick={(i) => { setPlaying(false); setIdx(i); }}
          />
        </section>
      </div>
    </Shell>
  );
}

function MoveList({ listRows, frames, analyses, snapshot, activeIdx, onPick }: {
  listRows: Array<{ kind: "divider"; roundIndex: number } | { kind: "move"; i: number }>;
  frames: ReturnType<typeof replay>;
  analyses: Array<Analysis | null>;
  snapshot: MatchSnapshot;
  activeIdx: number;
  onPick: (i: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
      {listRows.map((row, k) => {
              if (row.kind === "divider") {
                return (
                  <div key={"d-" + k} className="sticky top-0 z-[1] flex items-center gap-3 bg-gradient-to-b from-[color:var(--analyze-panel,#101014)] to-transparent px-4 pb-2 pt-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Round {row.roundIndex + 1}</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                );
              }
              const f = frames[row.i];
              const a = analyses[row.i];
              if (!a || f.by === null) return null;
              const name = snapshot.playerNames[f.by];
              const active = row.i === activeIdx;
              return (
                <button key={row.i} ref={active ? activeRef : undefined}
                  onClick={() => onPick(row.i)}
                  className={"grid w-full grid-cols-[32px_12px_110px_1fr_78px] items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition " +
                    (active
                      ? "ring-1 ring-inset ring-amber-400/40"
                      : "hover:bg-white/[0.04]")}
                  style={active
                    ? { background: "color-mix(in oklch, " + PLAYER_HEX[0] + " 16%, transparent)" }
                    : undefined}>
                  <span className={"font-mono text-[12px] " + (active ? "text-zinc-300" : "text-zinc-600")}>{f.plyIndex + 1}.</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: PLAYER_HEX[f.by] }} />
                  <span className={"truncate text-[13px] " + (active ? "font-semibold text-zinc-100" : "text-zinc-400")} title={name}>{name}</span>
                  <span className={"truncate font-mono text-[13px] " + (active ? "font-semibold text-white" : "text-zinc-200")}>{moveText(a.actual)}</span>
                  <span className={"justify-self-end rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest " + VERDICT_CHIP[a.verdict]}>
                    {a.verdict}
                  </span>
                </button>
              );
      })}
    </div>
  );
}

// Small persistent cache across CoachPanel remounts so scrubbing back and
// forth through moves never re-hits the AI gateway.
const COACH_CACHE = new Map<string, string>();
const COACH_INFLIGHT = new Map<string, Promise<string>>();

type Analysis = {
  verdict: Verdict; actual: Move; best: Move; delta: number;
  distMe: number; distOpp: number; distMeAfter: number; distOppAfter: number;
};

function CoachPanel({ snapshot, frame, analysis }: {
  snapshot: MatchSnapshot;
  frame: { state: GameState; roundIndex: number; plyIndex: number; by: PlayerId | null } | null;
  analysis: Analysis | null;
}) {
  const call = useServerFn(explainMove);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = frame && analysis && frame.by !== null
    ? `${snapshot.mode}:${frame.roundIndex}:${frame.plyIndex}`
    : null;

  useEffect(() => {
    // Debounce so scrubbing quickly doesn't spam the gateway. Only fetch
    // when the user pauses on a move for ~700ms. Cache per key so re-visits
    // are free.
    if (!key || !frame || !analysis || frame.by === null) { setNote(null); return; }
    const cached = COACH_CACHE.get(key);
    if (cached) { setNote(cached); setBusy(false); return; }
    setNote(null);
    setBusy(true);
    const slot = frame.by;
    const inflight = COACH_INFLIGHT.get(key);
    const t = window.setTimeout(async () => {
      try {
        const p = inflight ?? call({
          data: {
            fenLike: `mode=${snapshot.mode} round=${snapshot.rounds.length}`,
            moveText: moveText(analysis.actual),
            playerLabel: snapshot.playerNames[slot],
            distMe: analysis.distMe, distOpp: analysis.distOpp,
            distMeAfter: analysis.distMeAfter, distOppAfter: analysis.distOppAfter,
            bestMoveText: moveText(analysis.best),
            verdict: analysis.verdict,
          },
        }).then((r) => r.text);
        if (!inflight) COACH_INFLIGHT.set(key, p);
        const text = await p;
        COACH_CACHE.set(key, text);
        COACH_INFLIGHT.delete(key);
        setNote(text);
      } catch {
        setNote("Coach is offline — try clicking Explain on the card below.");
      } finally { setBusy(false); }
    }, 700);
    return () => window.clearTimeout(t);
  }, [key, frame, analysis, snapshot, call]);

  const speaker = frame && frame.by !== null ? snapshot.playerNames[frame.by] : null;
  const verdict = analysis?.verdict;
  const quip = verdict ? pickQuip(verdict, `${frame?.roundIndex}-${frame?.plyIndex}`) : null;

  return (
    <div className="coach-in sticky top-0 z-[2] flex items-start gap-4 border-b border-white/10 bg-[#101014]/95 px-4 py-4 backdrop-blur">
      <div aria-hidden className={
        "grid h-20 w-20 shrink-0 place-items-center rounded-2xl border text-4xl shadow-lg " +
        (verdict ? coachAvatarStyle(verdict) : "border-white/10 bg-gradient-to-br from-amber-500/25 to-amber-500/5 shadow-amber-500/10")
      }>
        <span className="coach-eye">{verdict ? COACH_EMOJI[verdict] : "🧙"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-amber-300">Coach</p>
          {speaker && (
            <span className="truncate text-[11px] text-zinc-500">
              on <span className="text-zinc-300">{speaker}</span>
              {verdict && (
                <span className={"ml-2 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest " + VERDICT_CHIP[verdict]}>
                  {verdict}
                </span>
              )}
            </span>
          )}
        </div>
        {!frame || !analysis || frame.by === null ? (
          <p className="mt-1.5 text-lg font-semibold leading-tight text-zinc-300">
            Pick any move to hear my take.
          </p>
        ) : (
          <>
            <p className={"mt-1 text-2xl font-extrabold leading-tight tracking-tight " + (verdict ? QUIP_COLOR[verdict] : "text-zinc-100")}>
              {quip}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-zinc-400">
              {busy
                ? <span className="italic text-zinc-500">Thinking…</span>
                : note ?? <span className="italic text-zinc-500">…</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const COACH_EMOJI: Record<Verdict, string> = {
  best: "🧠",
  good: "👍",
  inaccuracy: "🤔",
  mistake: "😬",
  blunder: "💀",
};

const QUIP_COLOR: Record<Verdict, string> = {
  best: "text-emerald-300",
  good: "text-lime-300",
  inaccuracy: "text-amber-300",
  mistake: "text-orange-300",
  blunder: "text-rose-300",
};

const QUIPS: Record<Verdict, string[]> = {
  best: ["Perfect.", "Now that's chess.", "Book move.", "Chef's kiss.", "Textbook.", "Nailed it."],
  good: ["Good move.", "Solid.", "I'll take it.", "Nice one.", "Fine choice.", "Clean."],
  inaccuracy: ["Meh.", "Could be better.", "A bit loose.", "Slightly off.", "Not quite.", "Eh, ok."],
  mistake: ["Bad move.", "Ouch.", "Yikes.", "That hurts.", "Rough call.", "Oof."],
  blunder: ["What a blunder!", "Catastrophic.", "You cannot be serious.", "Absolutely tragic.", "💀 blunder city.", "Turn off the stream."],
};

function coachAvatarStyle(v: Verdict): string {
  switch (v) {
    case "best": return "border-emerald-400/40 bg-gradient-to-br from-emerald-500/30 to-emerald-500/5 shadow-emerald-500/20";
    case "good": return "border-lime-400/40 bg-gradient-to-br from-lime-500/30 to-lime-500/5 shadow-lime-500/20";
    case "inaccuracy": return "border-amber-400/40 bg-gradient-to-br from-amber-500/30 to-amber-500/5 shadow-amber-500/20";
    case "mistake": return "border-orange-400/40 bg-gradient-to-br from-orange-500/30 to-orange-500/5 shadow-orange-500/20";
    case "blunder": return "border-rose-400/40 bg-gradient-to-br from-rose-500/30 to-rose-500/5 shadow-rose-500/20";
  }
}

function pickQuip(v: Verdict, seedKey: string): string {
  const arr = QUIPS[v];
  let h = 2166136261;
  for (let i = 0; i < seedKey.length; i++) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return arr[Math.abs(h) % arr.length];
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
    <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-600">Played by</span>{" "}
          <span className="font-semibold text-zinc-100" style={{ color: PLAYER_HEX[slot] }}>{snapshot.playerNames[slot]}</span>
          <span className="text-zinc-600"> · </span>
          <span className="font-mono text-zinc-100">{moveText(actual)}</span>
        </p>
        <span className={"rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest " + VERDICT_CHIP[analysis.verdict]}>
          {analysis.verdict}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">
        Engine suggested <span className="font-mono text-zinc-200">{moveText(analysis.best)}</span>
        <span className="text-zinc-700"> · </span>
        path <span className="font-mono text-zinc-300">{analysis.distMe}→{analysis.distMeAfter}</span>
        <span className="text-zinc-700"> · </span>
        opp <span className="font-mono text-zinc-300">{analysis.distOpp}→{analysis.distOppAfter}</span>
      </p>
      <div className="mt-2.5">
        <button onClick={explain} disabled={busy}
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-zinc-100 transition hover:bg-white/[0.09] disabled:opacity-60">
          {busy ? "Thinking…" : note ? "Re-explain" : "Explain with AI"}
        </button>
        {note && <p className="mt-2 text-xs italic text-zinc-200">{note}</p>}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08080b] font-[Manrope,system-ui,sans-serif] text-zinc-100 lg:h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-4 pb-6 pt-4 sm:px-8 lg:h-full lg:min-h-0">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-200">← Home</Link>
        <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </main>
  );
}