import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BOARD,
  goalsFor,
  startsFor,
  type GameState,
  type MoveRecord,
  type PlayerId,
  type Pos,
  type Wall,
} from "@/lib/quoridor";
import { PLAYER_COLORS } from "@/components/QuoridorBoard";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

function notate(rec: MoveRecord): string {
  if (rec.move.kind === "pawn") {
    const [r, c] = rec.move.to;
    return `${FILES[c]}${9 - r}`;
  }
  const { r, c, o } = rec.move.wall;
  return `${FILES[c]}${9 - r}${o}`;
}

export type HistorySnapshot = { pawns: Pos[]; walls: Wall[]; lastWall: Wall | null };

function reconstruct(state: GameState, upto: number): HistorySnapshot {
  const pawns: Pos[] = startsFor(state.mode);
  const walls: Wall[] = [];
  let lastWall: Wall | null = null;
  const history = state.moves ?? [];
  for (let i = 0; i < upto && i < history.length; i++) {
    const rec = history[i];
    if (rec.move.kind === "pawn") {
      pawns[rec.by] = [rec.move.to[0], rec.move.to[1]];
    } else {
      const w: Wall = { ...rec.move.wall, by: rec.by };
      walls.push(w);
      lastWall = w;
    }
  }
  return { pawns, walls, lastWall };
}

function MiniBoard({
  state,
  snapshot,
  highlight,
}: {
  state: GameState;
  snapshot: HistorySnapshot;
  highlight: MoveRecord | null;
}) {
  const goals = goalsFor(state.mode);
  const cells: ReactNode[] = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      cells.push(
        <div
          key={`c${r}-${c}`}
          className="rounded-[3px] bg-secondary/40"
          style={{ gridColumn: 2 * c + 1, gridRow: 2 * r + 1 }}
        />,
      );
    }
  }
  // Goal-row tints
  for (let i = 0; i < state.mode; i++) {
    const g = goals[i];
    const color = PLAYER_COLORS[i];
    if (g.kind === "row") {
      for (let c = 0; c < BOARD; c++) {
        cells.push(
          <div
            key={`g${i}-${c}`}
            className="pointer-events-none rounded-[3px]"
            style={{
              gridColumn: 2 * c + 1,
              gridRow: 2 * g.value + 1,
              background: `color-mix(in oklab, ${color} 14%, transparent)`,
            }}
          />,
        );
      }
    } else {
      for (let r = 0; r < BOARD; r++) {
        cells.push(
          <div
            key={`g${i}-r${r}`}
            className="pointer-events-none rounded-[3px]"
            style={{
              gridColumn: 2 * g.value + 1,
              gridRow: 2 * r + 1,
              background: `color-mix(in oklab, ${color} 14%, transparent)`,
            }}
          />,
        );
      }
    }
  }
  // Pawns
  const pawnEls = snapshot.pawns.map((p, i) => {
    const isMoved = highlight?.move.kind === "pawn" && highlight.by === i;
    return (
      <div
        key={`p${i}`}
        className="pointer-events-none m-[10%] rounded-full"
        style={{
          gridColumn: 2 * p[1] + 1,
          gridRow: 2 * p[0] + 1,
          background: PLAYER_COLORS[i],
          boxShadow: isMoved
            ? `0 0 0 2px color-mix(in oklab, ${PLAYER_COLORS[i]} 80%, white)`
            : "inset 0 -2px 0 rgba(0,0,0,0.18)",
        }}
      />
    );
  });
  // Walls
  const wallEls = snapshot.walls.map((w, i) => {
    const isNew =
      highlight?.move.kind === "wall" &&
      highlight.move.wall.r === w.r &&
      highlight.move.wall.c === w.c &&
      highlight.move.wall.o === w.o;
    const color = isNew
      ? `color-mix(in oklab, ${PLAYER_COLORS[w.by]} 90%, white)`
      : "oklch(0.35 0.03 55)";
    if (w.o === "h") {
      return (
        <div
          key={`w${i}`}
          className="pointer-events-none rounded-full"
          style={{
            gridColumn: `${2 * w.c + 1} / span 3`,
            gridRow: 2 * w.r + 2,
            background: color,
            height: "60%",
            alignSelf: "center",
            boxShadow: isNew ? `0 0 8px ${color}` : undefined,
          }}
        />
      );
    }
    return (
      <div
        key={`w${i}`}
        className="pointer-events-none rounded-full"
        style={{
          gridColumn: 2 * w.c + 2,
          gridRow: `${2 * w.r + 1} / span 3`,
          background: color,
          width: "60%",
          justifySelf: "center",
          boxShadow: isNew ? `0 0 8px ${color}` : undefined,
        }}
      />
    );
  });
  return (
    <div
      className="grid aspect-square w-full rounded-md border border-border bg-background p-2"
      style={{
        gridTemplateColumns: `repeat(${BOARD - 1}, 1fr 0.14fr) 1fr`,
        gridTemplateRows: `repeat(${BOARD - 1}, 1fr 0.14fr) 1fr`,
        gap: 0,
      }}
    >
      {cells}
      {wallEls}
      {pawnEls}
    </div>
  );
}

export function MoveHistory({
  state,
  nameOf,
}: {
  state: GameState;
  nameOf: (p: PlayerId) => string;
}) {
  return <MoveHistoryPanel state={state} nameOf={nameOf} defaultOpen={false} />;
}

export function MoveHistoryPanel({
  state,
  nameOf,
  defaultOpen = false,
  compact = false,
  onView,
}: {
  state: GameState;
  nameOf: (p: PlayerId) => string;
  defaultOpen?: boolean;
  compact?: boolean;
  onView?: (view: HistorySnapshot | null) => void;
}) {
  // Note: `defaultOpen` is intentionally ignored — the panel is always open
  // when there are moves. Toggling it caused the whole page to shift.
  void defaultOpen;
  const history = state.moves ?? [];
  const [step, setStep] = useState(history.length);
  // Keep step pinned to the tail so newly played moves show up during live play.
  const stepRef = useMemo(() => ({ prevLen: history.length }), []);
  if (stepRef.prevLen !== history.length) {
    if (step === stepRef.prevLen) setStep(history.length);
    stepRef.prevLen = history.length;
  }
  const snapshot = useMemo(() => reconstruct(state, step), [state, step]);
  const highlight = step > 0 ? (history[step - 1] ?? null) : null;

  // Broadcast the currently-reviewed board so a parent can mirror it on the
  // main game board. Emit null when the panel is closed or pinned to the
  // latest move — that way live opponent moves snap the board back.
  const reviewing = step < history.length;
  useEffect(() => {
    if (!onView) return;
    onView(reviewing ? snapshot : null);
    return () => {
      onView(null);
    };
  }, [reviewing, snapshot, onView]);

  // Auto-scroll the moves list to the bottom whenever a new move is appended
  // and the user is pinned to the latest move (not reviewing history).
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (reviewing) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, reviewing]);

  const first = () => setStep(0);
  const prev = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(history.length, s + 1));
  const last = () => setStep(history.length);

  return (
    <div className={(compact ? "" : "mt-3 ") + "w-full max-w-md text-left"}>
      <div className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-medium">
        <span>
          {compact ? "Move history" : "Review moves"}{" "}
          <span className="text-muted-foreground">· {history.length}</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {history.length === 0 ? "—" : `${step}/${history.length}`}
        </span>
      </div>
      <div className="mt-2 rounded-lg border border-border bg-background/60 p-3">
        {!compact && (
          <div className="mx-auto mb-3 max-w-[220px]">
            <MiniBoard state={state} snapshot={snapshot} highlight={highlight} />
          </div>
        )}
        {/* Current-move label (fixed height so new moves don't shift layout) */}
        <div className="flex h-5 items-center text-xs text-muted-foreground">
          {history.length === 0 ? (
            <span className="italic opacity-70">No moves yet</span>
          ) : step === 0 ? (
            "Round start"
          ) : (
            <>
              <span
                className="inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: PLAYER_COLORS[highlight!.by], marginRight: 6 }}
              />
              {`#${step} ${nameOf(highlight!.by)} · `}
              <span className="font-mono">
                {highlight!.move.kind === "wall"
                  ? `wall ${notate(highlight!)}`
                  : notate(highlight!)}
              </span>
            </>
          )}
        </div>

        {/* Moves list — fixed height reserves space so adding moves never shifts. */}
        <ol
          ref={listRef}
          className="mt-2 grid h-[5.5rem] grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto pr-1 text-xs"
        >
          {history.length === 0 ? (
            <li className="col-span-2 pt-4 text-center text-muted-foreground/60">
              Moves will appear here.
            </li>
          ) : (
            history.map((rec, i) => {
              const active = i === step - 1;
              const label = rec.move.kind === "wall" ? `wall ${notate(rec)}` : notate(rec);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setStep(i + 1)}
                    className={
                      "flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono transition-colors " +
                      (active ? "bg-accent text-accent-foreground" : "hover:bg-secondary/60")
                    }
                  >
                    <span className="w-6 text-right text-muted-foreground">{i + 1}.</span>
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: PLAYER_COLORS[rec.by] }}
                    />
                    <span>{label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ol>

        {/* Nav arrows — bigger, at the bottom, centered. */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <StepBtn onClick={first} disabled={step === 0} label="⏮" title="First" />
          <StepBtn onClick={prev} disabled={step === 0} label="◀" title="Previous" />
          <span className="min-w-[4rem] text-center text-sm tabular-nums text-muted-foreground">
            {step}/{history.length}
          </span>
          <StepBtn onClick={next} disabled={step === history.length} label="▶" title="Next" />
          <StepBtn onClick={last} disabled={step === history.length} label="⏭" title="Last" />
        </div>
      </div>
    </div>
  );
}

function StepBtn({
  onClick,
  disabled,
  label,
  title,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="grid h-10 w-10 place-items-center rounded-md border border-border bg-secondary/40 text-base transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
