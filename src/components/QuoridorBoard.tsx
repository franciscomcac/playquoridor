import { useRef, useState } from "react";
import {
  BOARD,
  canPlaceWall,
  goalsFor,
  legalPawnMoves,
  type GameState,
  type Move,
  type Orient,
  type PlayerId,
  type Wall,
  type WallSpec,
} from "@/lib/quoridor";

type Props = {
  state: GameState;
  you: PlayerId;
  onMove: (m: Move) => void;
  interactive: boolean;
};

export const PLAYER_COLORS = [
  "oklch(0.82 0.16 85)",   // gold
  "oklch(0.62 0.14 250)",  // slate blue
  "oklch(0.6 0.2 25)",     // crimson
  "oklch(0.66 0.14 155)",  // jade
];
export const PLAYER_NAMES = ["Gold", "Slate", "Crimson", "Jade"];

type HoverTarget =
  | { kind: "cell"; r: number; c: number }
  | { kind: "wall"; wall: WallSpec };

const WALL_SNAP_RADIUS = 0.2;

export function QuoridorBoard({ state, you, onMove, interactive }: Props) {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const isYourTurn =
    interactive &&
    state.turn === you &&
    state.winner === null &&
    state.active[you];
  const legal = isYourTurn ? legalPawnMoves(state, you) : [];
  const legalSet = new Set(legal.map(([r, c]) => `${r},${c}`));
  const goals = goalsFor(state.mode);
  const yourColor = PLAYER_COLORS[you];

  function targetFor(e: { clientX: number; clientY: number }): HoverTarget | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD;
    if (x < 0 || x > BOARD || y < 0 || y > BOARD) return null;
    const gy = Math.min(BOARD - 1, Math.max(1, Math.round(y)));
    const gx = Math.min(BOARD - 1, Math.max(1, Math.round(x)));
    const dy = Math.abs(y - gy);
    const dx = Math.abs(x - gx);
    if (Math.min(dx, dy) < WALL_SNAP_RADIUS) {
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
    if (!isYourTurn) {
      if (hover) setHover(null);
      return;
    }
    const t = targetFor(e);
    setHover((prev) => {
      if (!t && !prev) return prev;
      if (!t || !prev) return t;
      if (t.kind === "cell" && prev.kind === "cell" && t.r === prev.r && t.c === prev.c) return prev;
      if (
        t.kind === "wall" &&
        prev.kind === "wall" &&
        t.wall.r === prev.wall.r &&
        t.wall.c === prev.wall.c &&
        t.wall.o === prev.wall.o
      )
        return prev;
      return t;
    });
  }

  function handleClick(e: React.MouseEvent) {
    if (!isYourTurn) return;
    const t = targetFor(e);
    if (!t) return;
    if (t.kind === "cell") {
      if (legalSet.has(`${t.r},${t.c}`)) onMove({ kind: "pawn", to: [t.r, t.c] });
    } else {
      if (state.wallsLeft[you] > 0 && canPlaceWall(state, you, t.wall)) {
        onMove({ kind: "wall", wall: t.wall });
      }
    }
  }

  const ghostWall =
    hover && hover.kind === "wall" && state.wallsLeft[you] > 0 && canPlaceWall(state, you, hover.wall)
      ? hover.wall
      : null;
  const invalidGhost = hover && hover.kind === "wall" && !ghostWall ? hover.wall : null;
  const hoverCell = hover && hover.kind === "cell" ? hover : null;
  const cursor =
    ghostWall || (hoverCell && legalSet.has(`${hoverCell.r},${hoverCell.c}`))
      ? "pointer"
      : "default";

  // Tint each player's goal edge with their color.
  const goalTint: Record<string, string> = {};
  for (let i = 0; i < state.mode; i++) {
    const g = goals[i];
    if (g.kind === "row") {
      for (let c = 0; c < BOARD; c++) goalTint[`${g.value},${c}`] = PLAYER_COLORS[i];
    } else {
      for (let r = 0; r < BOARD; r++) goalTint[`${r},${g.value}`] = PLAYER_COLORS[i];
    }
  }

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const isLegal = legalSet.has(`${r},${c}`);
      const isHovered = hoverCell && hoverCell.r === r && hoverCell.c === c;
      const alt = (r + c) % 2 === 0;
      const tint = goalTint[`${r},${c}`];
      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            gridRow: r + 1,
            gridColumn: c + 1,
            background: alt ? "var(--board-cell)" : "var(--board-cell-alt)",
            boxShadow:
              `inset 0 0 0 1px var(--board-line)` +
              (tint ? `, inset 0 0 0 3px color-mix(in oklab, ${tint} 22%, transparent)` : ""),
          }}
          className="relative"
        >
          {isLegal && (
            <span
              className={
                "pointer-events-none absolute left-1/2 top-1/2 block rounded-full " +
                (isHovered ? "move-target-hover" : "")
              }
              style={{
                width: isHovered ? "52%" : "24%",
                height: isHovered ? "52%" : "24%",
                background: yourColor,
                opacity: isHovered ? 0.75 : 0.4,
                transform: "translate(-50%,-50%)",
                transition: "width 120ms ease-out, height 120ms ease-out, opacity 120ms ease-out",
              }}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <div className="wood-frame aspect-square w-full">
      <div
        ref={boardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
        onClick={handleClick}
        className="relative h-full w-full select-none overflow-hidden rounded-md"
        style={{ cursor, background: "var(--board-bg)" }}
      >
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${BOARD}, 1fr)`,
            gridTemplateRows: `repeat(${BOARD}, 1fr)`,
          }}
        >
          {cells}
        </div>

        {/* Pawns — absolute so they glide between cells */}
        {state.pawns.map((p, i) =>
          state.active[i] ? (
            <div
              key={`pawn-${i}`}
              className="pawn-glide pointer-events-none absolute grid place-items-center"
              style={{
                left: `${(p[1] / BOARD) * 100}%`,
                top: `${(p[0] / BOARD) * 100}%`,
                width: `${(1 / BOARD) * 100}%`,
                height: `${(1 / BOARD) * 100}%`,
                zIndex: 3,
              }}
            >
              <Pawn
                player={i as PlayerId}
                you={you}
                active={state.turn === i && state.winner === null}
              />
            </div>
          ) : null,
        )}

        {/* Placed walls */}
        {state.walls.map((w) => (
          <WallView
            key={`w-${w.o}-${w.r}-${w.c}`}
            wall={w}
            tone="solid"
            latest={
              state.lastWall !== null &&
              state.lastWall.o === w.o &&
              state.lastWall.r === w.r &&
              state.lastWall.c === w.c
            }
          />
        ))}

        {/* Hover ghost */}
        {ghostWall && <WallView wall={{ ...ghostWall, by: you }} tone="ghost" />}
        {invalidGhost && <WallView wall={{ ...invalidGhost, by: you }} tone="invalid" />}
      </div>
    </div>
  );
}

function WallView({
  wall,
  tone,
  latest,
}: {
  wall: Wall;
  tone: "solid" | "ghost" | "invalid";
  latest?: boolean;
}) {
  const color = PLAYER_COLORS[wall.by ?? 0];
  const thickness = 14;
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
    position: "absolute",
    background: bg,
    borderRadius: "4px",
    boxShadow: shadow,
    pointerEvents: "none",
    zIndex: 2,
    color, // for currentColor drop-shadow in .wall-latest
  };
  const className = latest ? "wall-latest" : "";
  if (wall.o === "h") {
    return (
      <div
        className={className}
        style={{
          ...common,
          top: `${((wall.r + 1) / BOARD) * 100}%`,
          left: `${(wall.c / BOARD) * 100}%`,
          width: `${(2 / BOARD) * 100}%`,
          height: thickness,
          transform: "translateY(-50%)",
        }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        ...common,
        left: `${((wall.c + 1) / BOARD) * 100}%`,
        top: `${(wall.r / BOARD) * 100}%`,
        height: `${(2 / BOARD) * 100}%`,
        width: thickness,
        transform: "translateX(-50%)",
      }}
    />
  );
}

function Pawn({
  player,
  you,
  active,
}: {
  player: PlayerId;
  you: PlayerId;
  active: boolean;
}) {
  const color = PLAYER_COLORS[player];
  const isYou = player === you;
  return (
    <span
      className="grid h-[72%] w-[72%] place-items-center rounded-full text-sm font-semibold"
      style={{
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${color} 60%, white 45%), ${color} 60%, color-mix(in oklab, ${color} 70%, black 35%) 100%)`,
        boxShadow:
          `0 5px 12px rgba(0,0,0,0.6), inset 0 -3px 5px rgba(0,0,0,0.35)` +
          (isYou ? `, 0 0 0 2px oklch(0.98 0.02 82)` : "") +
          (active
            ? `, 0 0 16px color-mix(in oklab, ${color} 65%, transparent)`
            : ""),
        color: "oklch(0.15 0.02 55)",
      }}
    >
      {player + 1}
    </span>
  );
}