import { useRef, useState } from "react";
import {
  BOARD,
  canPlaceWall,
  legalPawnMoves,
  type GameState,
  type Move,
  type Orient,
  type Wall,
} from "@/lib/quoridor";

type Props = {
  state: GameState;
  you: 0 | 1;
  onMove: (m: Move) => void;
  interactive: boolean;
};

type HoverTarget =
  | { kind: "cell"; r: number; c: number }
  | { kind: "wall"; wall: Wall };

// How close (in cell-widths) to a gridline before we snap to a wall.
// Small radius = most of a cell is a "safe" pawn-move zone, only a thin
// strip right on the gridline registers as a wall — snappier, fewer misclicks.
const WALL_SNAP_RADIUS = 0.18;

export function QuoridorBoard({ state, you, onMove, interactive }: Props) {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const isYourTurn = interactive && state.turn === you && state.winner === null;
  const legal = isYourTurn ? legalPawnMoves(state, you) : [];
  const legalSet = new Set(legal.map(([r, c]) => `${r},${c}`));

  function targetFor(e: { clientX: number; clientY: number }): HoverTarget | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD;
    if (x < 0 || x > BOARD || y < 0 || y > BOARD) return null;

    // Nearest interior gridline (1..8) in each axis
    const gy = Math.min(BOARD - 1, Math.max(1, Math.round(y)));
    const gx = Math.min(BOARD - 1, Math.max(1, Math.round(x)));
    const dy = Math.abs(y - gy);
    const dx = Math.abs(x - gx);

    if (Math.min(dx, dy) < WALL_SNAP_RADIUS) {
      let o: Orient;
      let r: number;
      let c: number;
      if (dy <= dx) {
        // Cursor is close to a horizontal gridline → horizontal wall
        o = "h";
        r = gy - 1;
        c = Math.min(BOARD - 2, Math.max(0, Math.round(x) - 1));
      } else {
        o = "v";
        c = gx - 1;
        r = Math.min(BOARD - 2, Math.max(0, Math.round(y) - 1));
      }
      return { kind: "wall", wall: { r, c, o } };
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
    // Avoid noisy state updates
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
  const invalidGhost =
    hover && hover.kind === "wall" && !ghostWall ? hover.wall : null;
  const hoverCell = hover && hover.kind === "cell" ? hover : null;
  const cursor =
    ghostWall || (hoverCell && legalSet.has(`${hoverCell.r},${hoverCell.c}`))
      ? "pointer"
      : "default";

  // Render 9x9 cells
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const p1 = state.pawns[0][0] === r && state.pawns[0][1] === c;
      const p2 = state.pawns[1][0] === r && state.pawns[1][1] === c;
      const isLegal = legalSet.has(`${r},${c}`);
      const isGoal1 = r === 0;
      const isGoal2 = r === BOARD - 1;
      const bg = isGoal1
        ? "var(--goal-1)"
        : isGoal2
          ? "var(--goal-2)"
          : (r + c) % 2 === 0
            ? "var(--board-cell)"
            : "var(--board-cell-alt)";
      const isHovered = hoverCell && hoverCell.r === r && hoverCell.c === c;
      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            gridRow: r + 1,
            gridColumn: c + 1,
            background: bg,
            boxShadow: "inset 0 0 0 1px var(--board-line)",
          }}
          className="relative flex items-center justify-center"
        >
          {p1 && <Pawn player={0} you={you} />}
          {p2 && <Pawn player={1} you={you} />}
          {isLegal && !p1 && !p2 && (
            <span
              className="pointer-events-none block rounded-full transition-all"
              style={{
                width: isHovered ? "44%" : "18%",
                height: isHovered ? "44%" : "18%",
                background: you === 0 ? "var(--pawn-1)" : "var(--pawn-2)",
                opacity: isHovered ? 0.55 : 0.32,
              }}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.15em] text-muted-foreground">
        <span>
          {isYourTurn
            ? "Your move"
            : state.winner !== null
              ? "Game over"
              : "Opponent's turn"}
        </span>
        <span>Walls left: {state.wallsLeft[you]}</span>
      </div>
      <div
        className="aspect-square w-full rounded-lg p-2 shadow-inner"
        style={{ background: "var(--board-bg)" }}
      >
        <div
          ref={boardRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
          onClick={handleClick}
          className="relative h-full w-full select-none"
          style={{ cursor }}
        >
          <div
            className="grid h-full w-full overflow-hidden rounded-[4px]"
            style={{
              gridTemplateColumns: `repeat(${BOARD}, 1fr)`,
              gridTemplateRows: `repeat(${BOARD}, 1fr)`,
            }}
          >
            {cells}
          </div>
          {state.walls.map((w) => (
            <WallSpan key={`w-${w.o}-${w.r}-${w.c}`} wall={w} tone="solid" />
          ))}
          {ghostWall && <WallSpan wall={ghostWall} tone="ghost" />}
          {invalidGhost && <WallSpan wall={invalidGhost} tone="invalid" />}
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Hover a square to move · hover between cells to place a wall — orientation snaps automatically
      </p>
    </div>
  );
}

function WallSpan({ wall, tone }: { wall: Wall; tone: "solid" | "ghost" | "invalid" }) {
  const thickness = 12; // px — chunky, clearly visible
  const bg =
    tone === "solid"
      ? "var(--wall)"
      : tone === "ghost"
        ? "var(--wall-ghost)"
        : "oklch(0.55 0.2 25 / 0.35)";
  const shadow = tone === "solid" ? "0 1px 2px rgba(0,0,0,0.25)" : "none";
  const common: React.CSSProperties = {
    position: "absolute",
    background: bg,
    borderRadius: "3px",
    boxShadow: shadow,
    pointerEvents: "none",
    zIndex: 2,
  };
  if (wall.o === "h") {
    return (
      <div
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

function Pawn({ player, you }: { player: 0 | 1; you: 0 | 1 }) {
  const color = player === 0 ? "var(--pawn-1)" : "var(--pawn-2)";
  const isYou = player === you;
  return (
    <span
      className="block h-[68%] w-[68%] rounded-full"
      style={{
        background: color,
        boxShadow: isYou
          ? "0 2px 6px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(0,0,0,0.25), 0 0 0 2px oklch(0.98 0.02 82)"
          : "0 2px 6px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(0,0,0,0.25)",
      }}
    />
  );
}