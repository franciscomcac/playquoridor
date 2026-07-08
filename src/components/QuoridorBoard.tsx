import { useEffect, useRef, useState } from "react";
import {
  BOARD, canPlaceWall, goalsFor, legalPawnMoves,
  type GameState, type Move, type Orient, type PlayerId,
  type Wall, type WallSpec,
} from "@/lib/quoridor";
import { play } from "@/lib/sound";

type Props = {
  state: GameState;
  you: PlayerId;
  onMove: (m: Move) => void;
  interactive: boolean;
  onActivity?: () => void;
};

export const PLAYER_COLORS = [
  "oklch(0.82 0.16 85)",
  "oklch(0.62 0.14 250)",
  "oklch(0.6 0.2 25)",
  "oklch(0.66 0.14 155)",
];
export const PLAYER_NAMES = ["Gold", "Slate", "Crimson", "Jade"];

type HoverTarget = { kind: "cell"; r: number; c: number } | { kind: "wall"; wall: WallSpec };
const WALL_SNAP_RADIUS = 0.2;
const WALL_SNAP_RADIUS_TOUCH = 0.34;

type Pop = { key: number; player: PlayerId; r: number; c: number };

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

export function QuoridorBoard({ state, you, onMove, interactive, onActivity }: Props) {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  // Touch users get a two-tap flow: first tap arms a ghost wall; second tap
  // in the same spot places it. The armed spec also drives an on-board
  // orientation toggle (H↔V) so mis-picks are cheap to fix.
  const [armed, setArmed] = useState<WallSpec | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // Per-player POV rotation so each seat sees their pawn on the bottom.
  // 2-player: player 1 flips 180°. 4-player: cardinal orientation per seat.
  const rotation =
    state.mode === 4
      ? ([0, 180, -90, 90][you] ?? 0)
      : state.mode === 2 && you === 1
        ? 180
        : 0;
  const rotated = rotation !== 0;

  // Pawn elimination pops — track slots that just went inactive.
  const [pops, setPops] = useState<Pop[]>([]);
  const prevActive = useRef<boolean[]>(state.active);
  useEffect(() => {
    const now: Pop[] = [];
    for (let i = 0; i < state.mode; i++) {
      if (prevActive.current[i] && !state.active[i]) {
        now.push({ key: Date.now() + i, player: i as PlayerId, r: state.pawns[i][0], c: state.pawns[i][1] });
      }
    }
    if (now.length) {
      setPops((prev) => [...prev, ...now]);
      const toClear = now.map((p) => p.key);
      window.setTimeout(() => {
        setPops((prev) => prev.filter((p) => !toClear.includes(p.key)));
      }, 500);
    }
    prevActive.current = state.active;
  }, [state.active, state.mode, state.pawns]);

  const isYourTurn = interactive && state.turn === you && state.winner === null && state.active[you];
  const legal = isYourTurn ? legalPawnMoves(state, you) : [];
  const legalSet = new Set(legal.map(([r, c]) => `${r},${c}`));
  const goals = goalsFor(state.mode);
  const yourColor = PLAYER_COLORS[you];

  function targetFor(e: { clientX: number; clientY: number }, touch = false): HoverTarget | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Coords relative to the (rotated) board's axis-aligned bounding rect.
    let px = e.clientX - rect.left;
    let py = e.clientY - rect.top;
    if (rotation !== 0) {
      const S = rect.width; // board is square
      const cx = px - S / 2, cy = py - S / 2;
      const rad = (-rotation * Math.PI) / 180;
      const rx = cx * Math.cos(rad) - cy * Math.sin(rad);
      const ry = cx * Math.sin(rad) + cy * Math.cos(rad);
      px = rx + S / 2;
      py = ry + S / 2;
    }
    const x = (px / rect.width) * BOARD;
    const y = (py / rect.height) * BOARD;
    if (x < 0 || x > BOARD || y < 0 || y > BOARD) return null;
    const gy = Math.min(BOARD - 1, Math.max(1, Math.round(y)));
    const gx = Math.min(BOARD - 1, Math.max(1, Math.round(x)));
    const dy = Math.abs(y - gy);
    const dx = Math.abs(x - gx);
    const snap = touch ? WALL_SNAP_RADIUS_TOUCH : WALL_SNAP_RADIUS;
    if (Math.min(dx, dy) < snap) {
      if (dy <= dx) {
        const r = gy - 1;
        const c = Math.min(BOARD - 2, Math.max(0, Math.round(x) - 1));
        return { kind: "wall", wall: { r, c, o: "h" as Orient } };
      } else {
        const c = gx - 1;
        const r = Math.min(BOARD - 2, Math.max(0, Math.round(y) - 1));
        return { kind: "wall", wall: { r, c, o: "v" as Orient } };
      }
    }
    const c = Math.min(BOARD - 1, Math.max(0, Math.floor(x)));
    const r = Math.min(BOARD - 1, Math.max(0, Math.floor(y)));
    return { kind: "cell", r, c };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return; // touch/pen use tap flow
    if (!isYourTurn) { if (hover) setHover(null); return; }
    const t = targetFor(e);
    setHover((prev) => {
      if (!t && !prev) return prev;
      if (!t || !prev) return t;
      if (t.kind === "cell" && prev.kind === "cell" && t.r === prev.r && t.c === prev.c) return prev;
      if (t.kind === "wall" && prev.kind === "wall" && t.wall.r === prev.wall.r && t.wall.c === prev.wall.c && t.wall.o === prev.wall.o) return prev;
      return t;
    });
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!isYourTurn) return;
    const touch = e.pointerType !== "mouse";
    if (touch !== isTouch) setIsTouch(touch);
    const t = targetFor(e, touch);
    if (!t) { setArmed(null); return; }
    onActivity?.();

    if (t.kind === "cell") {
      // Tapping a cell always cancels an armed wall.
      if (armed) setArmed(null);
      if (legalSet.has(`${t.r},${t.c}`)) onMove({ kind: "pawn", to: [t.r, t.c] });
      else play("denied");
      return;
    }

    // Wall target.
    if (!touch) {
      // Mouse: single click places (current desktop behavior).
      if (state.wallsLeft[you] > 0 && canPlaceWall(state, you, t.wall)) {
        onMove({ kind: "wall", wall: t.wall });
      } else {
        play("denied");
      }
      return;
    }

    // Touch: two-tap confirm on the same spec.
    const same = armed && armed.r === t.wall.r && armed.c === t.wall.c && armed.o === t.wall.o;
    if (same) {
      if (state.wallsLeft[you] > 0 && canPlaceWall(state, you, armed!)) {
        onMove({ kind: "wall", wall: armed! });
        setArmed(null);
      } else {
        play("denied");
      }
    } else {
      setArmed(t.wall);
    }
  }

  function rotateArmed() {
    if (!armed) return;
    const flipped: WallSpec = { ...armed, o: armed.o === "h" ? "v" : "h" };
    setArmed(flipped);
  }
  function clearArmed() { setArmed(null); }

  // Mouse hover ghost.
  const hoverGhost = hover && hover.kind === "wall" && state.wallsLeft[you] > 0 && canPlaceWall(state, you, hover.wall) ? hover.wall : null;
  const hoverInvalid = hover && hover.kind === "wall" && !hoverGhost ? hover.wall : null;
  // Touch armed ghost (persistent until placed or cancelled).
  const armedValid = armed && state.wallsLeft[you] > 0 && canPlaceWall(state, you, armed) ? armed : null;
  const armedInvalid = armed && !armedValid ? armed : null;
  const ghostWall = armedValid ?? hoverGhost;
  const invalidGhost = armedInvalid ?? hoverInvalid;
  const hoverCell = hover && hover.kind === "cell" ? hover : null;
  const cursor = ghostWall || (hoverCell && legalSet.has(`${hoverCell.r},${hoverCell.c}`)) ? "pointer" : "default";

  const goalTint: Record<string, string> = {};
  for (let i = 0; i < state.mode; i++) {
    const g = goals[i];
    if (g.kind === "row") for (let c = 0; c < BOARD; c++) goalTint[`${g.value},${c}`] = PLAYER_COLORS[i];
    else for (let r = 0; r < BOARD; r++) goalTint[`${r},${g.value}`] = PLAYER_COLORS[i];
  }

  // Subtle tint on the opponent's half so the two sides read as distinct
  // territory (only in 2-player mode, and only for actual seated players).
  let oppRowRange: [number, number] | null = null;
  if (state.mode === 2 && you >= 0 && you < 2) {
    oppRowRange = you === 0 ? [0, 3] : [5, 8];
  }

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const isLegal = legalSet.has(`${r},${c}`);
      const isHovered = hoverCell && hoverCell.r === r && hoverCell.c === c;
      const alt = (r + c) % 2 === 0;
      const tint = goalTint[`${r},${c}`];
      const isOpp = !!oppRowRange && r >= oppRowRange[0] && r <= oppRowRange[1];
      const baseCell = alt ? "var(--board-cell)" : "var(--board-cell-alt)";
      const bg = isOpp
        ? `color-mix(in oklab, ${baseCell} 84%, oklch(0.35 0.05 55))`
        : baseCell;
      cells.push(
        <div key={`${r}-${c}`} style={{
          gridRow: r + 1, gridColumn: c + 1,
          background: bg,
          boxShadow: `inset 0 0 0 1px var(--board-line)` +
            (tint ? `, inset 0 0 0 3px color-mix(in oklab, ${tint} 22%, transparent)` : ""),
        }} className="relative">
          {isLegal && (
            <span className={"pointer-events-none absolute left-1/2 top-1/2 block rounded-full " + (isHovered ? "move-target-hover" : "legal-breathe")}
              style={{
                width: isHovered ? "52%" : "24%", height: isHovered ? "52%" : "24%",
                background: yourColor, opacity: isHovered ? 0.75 : 0.4,
                transform: "translate(-50%,-50%)",
                transition: "width 120ms ease-out, height 120ms ease-out, opacity 120ms ease-out",
              }} />
          )}
        </div>,
      );
    }
  }

  return (
    <div className="w-full" style={{
      display: "grid",
      gridTemplateColumns: "1.25rem minmax(0,1fr)",
      gridTemplateRows: "minmax(0,1fr) 1.25rem",
      gap: "0.25rem",
    }}>
      <div aria-hidden className="flex flex-col justify-around py-[3%] text-[10px] font-medium uppercase tracking-widest text-muted-foreground sm:text-xs" style={{ visibility: rotated ? "hidden" : undefined }}>
        {Array.from({ length: BOARD }, (_, i) => (
          <span key={i} className="text-center leading-none">{BOARD - i}</span>
        ))}
      </div>
      <div className="wood-frame aspect-square w-full min-w-0">
      <div ref={boardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={handlePointerUp}
        className="relative h-full w-full select-none overflow-hidden rounded-md"
        style={{
          cursor,
          background: "var(--board-bg)",
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transition: "transform 240ms ease",
          touchAction: "manipulation",
        }}>
        <div className="grid h-full w-full"
          style={{ gridTemplateColumns: `repeat(${BOARD}, 1fr)`, gridTemplateRows: `repeat(${BOARD}, 1fr)` }}>
          {cells}
        </div>

        {state.pawns.map((p, i) =>
          state.active[i] ? (
            <div key={`pawn-${i}`} className="pawn-glide pointer-events-none absolute grid place-items-center"
              style={{
                left: `${(p[1] / BOARD) * 100}%`, top: `${(p[0] / BOARD) * 100}%`,
                width: `${(1 / BOARD) * 100}%`, height: `${(1 / BOARD) * 100}%`, zIndex: 3,
              }}>
              <Pawn key={`${p[0]}-${p[1]}`} player={i as PlayerId} you={you} active={state.turn === i && state.winner === null} counterRotate={rotation} />
            </div>
          ) : null,
        )}

        {state.walls.map((w) => (
          <WallView key={`w-${w.o}-${w.r}-${w.c}`} wall={w} tone="solid"
            latest={state.lastWall !== null && state.lastWall.o === w.o && state.lastWall.r === w.r && state.lastWall.c === w.c} />
        ))}

        {ghostWall && <WallView wall={{ ...ghostWall, by: you }} tone="ghost" />}
        {invalidGhost && <WallView wall={{ ...invalidGhost, by: you }} tone="invalid" />}

        {/* Pawn elimination FX */}
        {pops.map((p) => (
          <PopFX key={p.key} r={p.r} c={p.c} color={PLAYER_COLORS[p.player]} />
        ))}
      </div>
      </div>
      <div />
      <div aria-hidden className="flex justify-around px-[3%] text-[10px] font-medium uppercase tracking-widest text-muted-foreground sm:text-xs" style={{ visibility: rotated ? "hidden" : undefined }}>
        {FILES.map((f) => (
          <span key={f} className="text-center leading-none">{f}</span>
        ))}
      </div>
      {armed && (
        <div className="pointer-events-auto col-span-2 -mt-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <span className="uppercase tracking-widest text-muted-foreground">
            Tap again to place
          </span>
          <button onClick={rotateArmed}
            className="rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-widest hover:bg-secondary">
            Rotate {armed.o === "h" ? "→ V" : "→ H"}
          </button>
          <button onClick={clearArmed}
            className="rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px] uppercase tracking-widest hover:bg-secondary">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function WallView({ wall, tone, latest }: { wall: Wall; tone: "solid" | "ghost" | "invalid"; latest?: boolean; }) {
  const color = PLAYER_COLORS[wall.by ?? 0];
  const thickness = 18;
  const bg =
    tone === "solid"
      ? `linear-gradient(180deg, color-mix(in oklab, ${color} 100%, white 12%), ${color} 55%, color-mix(in oklab, ${color} 70%, black 25%))`
      : tone === "ghost"
        ? `color-mix(in oklab, ${color} 55%, transparent)`
        : "oklch(0.55 0.2 25 / 0.35)";
  const shadow =
    tone === "solid"
      ? `0 2px 4px rgba(0,0,0,0.55), 0 0 12px color-mix(in oklab, ${color} 35%, transparent)`
      : "none";
  const common: React.CSSProperties = {
    position: "absolute", background: bg, borderRadius: "4px",
    boxShadow: shadow, pointerEvents: "none", zIndex: 2, color,
  };
  const cls = (wall.o === "h" ? "wall-h " : "wall-v ") + (latest ? "wall-latest" : "");
  if (wall.o === "h") {
    return (
      <div className={cls} style={{
        ...common,
        top: `${((wall.r + 1) / BOARD) * 100}%`,
        left: `${(wall.c / BOARD) * 100}%`,
        width: `${(2 / BOARD) * 100}%`,
        height: thickness,
        transform: "translateY(-50%)",
      }} />
    );
  }
  return (
    <div className={cls} style={{
      ...common,
      left: `${((wall.c + 1) / BOARD) * 100}%`,
      top: `${(wall.r / BOARD) * 100}%`,
      height: `${(2 / BOARD) * 100}%`,
      width: thickness,
      transform: "translateX(-50%)",
    }} />
  );
}

function Pawn({ player, you, active, counterRotate = 0 }: { player: PlayerId; you: PlayerId; active: boolean; counterRotate?: number; }) {
  const color = PLAYER_COLORS[player];
  const isYou = player === you;
  return (
    <span className="pawn-land grid h-[72%] w-[72%] place-items-center rounded-full text-sm font-semibold"
      style={{
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${color} 60%, white 45%), ${color} 60%, color-mix(in oklab, ${color} 70%, black 35%) 100%)`,
        boxShadow:
          `0 5px 12px rgba(0,0,0,0.6), inset 0 -3px 5px rgba(0,0,0,0.35)` +
          (isYou ? `, 0 0 0 2px oklch(0.98 0.02 82)` : "") +
          (active ? `, 0 0 16px color-mix(in oklab, ${color} 65%, transparent)` : ""),
        color: "oklch(0.15 0.02 55)",
      }}>
      <span style={{ display: "inline-block", transform: counterRotate ? `rotate(${-counterRotate}deg)` : undefined }}>
        {player + 1}
      </span>
    </span>
  );
}

function PopFX({ r, c, color }: { r: number; c: number; color: string }) {
  const left = `${((c + 0.5) / BOARD) * 100}%`;
  const top = `${((r + 0.5) / BOARD) * 100}%`;
  const shards = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const dist = 42;
    return { sx: Math.cos(angle) * dist, sy: Math.sin(angle) * dist, key: i };
  });
  return (
    <div className="pointer-events-none absolute" style={{ left, top, width: 0, height: 0, zIndex: 4 }}>
      <span className="pop-flash absolute rounded-full"
        style={{ left: 0, top: 0, width: 60, height: 60, background: `radial-gradient(circle, white, ${color} 60%, transparent 70%)` }} />
      <span className="pawn-pop absolute grid place-items-center rounded-full text-sm font-semibold"
        style={{ left: 0, top: 0, width: 40, height: 40,
          background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${color} 60%, white 45%), ${color} 60%)`,
          color: "oklch(0.15 0.02 55)" }} />
      {shards.map((s) => (
        <span key={s.key} className="pop-shard absolute block rounded-sm"
          style={{
            left: 0, top: 0, width: 8, height: 10, background: color,
            ["--sx" as string]: `${s.sx}px`, ["--sy" as string]: `${s.sy}px`,
          } as React.CSSProperties} />
      ))}
    </div>
  );
}
