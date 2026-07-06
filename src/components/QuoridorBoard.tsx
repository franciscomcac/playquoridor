import { useState } from "react";
import {
  BOARD,
  canPlaceWall,
  legalPawnMoves,
  wallConflicts,
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

export function QuoridorBoard({ state, you, onMove, interactive }: Props) {
  const [orient, setOrient] = useState<Orient>("h");
  const [hoverWall, setHoverWall] = useState<Wall | null>(null);

  const isYourTurn = interactive && state.turn === you && state.winner === null;
  const legal = isYourTurn ? legalPawnMoves(state, you) : [];
  const legalSet = new Set(legal.map(([r, c]) => `${r},${c}`));

  const wallSet = new Set(state.walls.map((w) => `${w.o}${w.r},${w.c}`));

  const tryPlaceWall = (w: Wall) => {
    if (!isYourTurn) return;
    if (state.wallsLeft[you] <= 0) return;
    if (!canPlaceWall(state, you, w)) return;
    onMove({ kind: "wall", wall: w });
  };

  const hoverValid =
    hoverWall &&
    isYourTurn &&
    state.wallsLeft[you] > 0 &&
    canPlaceWall(state, you, hoverWall);

  // 9 cells + 8 gaps = 17 tracks. Cells wider than gaps.
  const cellFr = "1fr";
  const gapFr = "0.22fr";
  const tracks = Array.from({ length: 17 }, (_, i) => (i % 2 === 0 ? cellFr : gapFr)).join(" ");

  const items: React.ReactNode[] = [];

  for (let gr = 0; gr < 17; gr++) {
    for (let gc = 0; gc < 17; gc++) {
      const rowIsCell = gr % 2 === 0;
      const colIsCell = gc % 2 === 0;
      const key = `${gr}-${gc}`;
      const style: React.CSSProperties = {
        gridRow: `${gr + 1} / span 1`,
        gridColumn: `${gc + 1} / span 1`,
      };

      if (rowIsCell && colIsCell) {
        const r = gr / 2;
        const c = gc / 2;
        const p1 = state.pawns[0][0] === r && state.pawns[0][1] === c;
        const p2 = state.pawns[1][0] === r && state.pawns[1][1] === c;
        const isLegal = legalSet.has(`${r},${c}`);
        const goal1 = r === 0;
        const goal2 = r === BOARD - 1;
        const bg = goal1
          ? "var(--goal-1)"
          : goal2
            ? "var(--goal-2)"
            : (r + c) % 2 === 0
              ? "var(--board-cell)"
              : "var(--board-cell-alt)";
        items.push(
          <button
            key={key}
            type="button"
            aria-label={`cell ${r},${c}`}
            disabled={!isLegal}
            onClick={() => {
              if (isLegal) onMove({ kind: "pawn", to: [r, c] });
            }}
            style={{ ...style, background: bg }}
            className="relative flex items-center justify-center rounded-[3px] transition-colors disabled:cursor-default"
          >
            {p1 && <Pawn player={0} you={you} />}
            {p2 && <Pawn player={1} you={you} />}
            {isLegal && !p1 && !p2 && (
              <span
                className="pointer-events-none block h-3 w-3 rounded-full"
                style={{
                  background:
                    you === 0 ? "var(--pawn-1)" : "var(--pawn-2)",
                  opacity: 0.35,
                }}
              />
            )}
          </button>,
        );
      } else if (!rowIsCell && !colIsCell) {
        // intersection point — used to anchor wall placement targets
        const r = (gr - 1) / 2;
        const c = (gc - 1) / 2;
        const w: Wall = { r, c, o: orient };
        const invalid = wallConflicts(state.walls, w) || !isYourTurn;
        items.push(
          <button
            key={key}
            type="button"
            disabled={invalid || state.wallsLeft[you] <= 0}
            onMouseEnter={() => setHoverWall(w)}
            onMouseLeave={() =>
              setHoverWall((h) => (h && h.r === r && h.c === c ? null : h))
            }
            onClick={() => tryPlaceWall(w)}
            style={style}
            className="rounded-full transition-colors disabled:cursor-default"
            aria-label={`place ${orient} wall at ${r},${c}`}
          />,
        );
      } else {
        // wall slot between two cells
        items.push(<div key={key} style={style} />);
      }
    }
  }

  // overlay existing walls as spans
  for (const w of state.walls) {
    if (w.o === "h") {
      items.push(
        <div
          key={`wall-${w.o}-${w.r}-${w.c}`}
          style={{
            gridRow: `${w.r * 2 + 2} / span 1`,
            gridColumn: `${w.c * 2 + 1} / span 3`,
            background: "var(--wall)",
            borderRadius: "3px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          }}
        />,
      );
    } else {
      items.push(
        <div
          key={`wall-${w.o}-${w.r}-${w.c}`}
          style={{
            gridRow: `${w.r * 2 + 1} / span 3`,
            gridColumn: `${w.c * 2 + 2} / span 1`,
            background: "var(--wall)",
            borderRadius: "3px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          }}
        />,
      );
    }
  }

  // ghost wall preview
  if (hoverWall && hoverValid) {
    const w = hoverWall;
    if (w.o === "h") {
      items.push(
        <div
          key="ghost"
          className="pointer-events-none"
          style={{
            gridRow: `${w.r * 2 + 2} / span 1`,
            gridColumn: `${w.c * 2 + 1} / span 3`,
            background: "var(--wall-ghost)",
            borderRadius: "3px",
          }}
        />,
      );
    } else {
      items.push(
        <div
          key="ghost"
          className="pointer-events-none"
          style={{
            gridRow: `${w.r * 2 + 1} / span 3`,
            gridColumn: `${w.c * 2 + 2} / span 1`,
            background: "var(--wall-ghost)",
            borderRadius: "3px",
          }}
        />,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.15em] text-muted-foreground">
        <span>{isYourTurn ? "Your move" : state.winner !== null ? "Game over" : "Opponent's turn"}</span>
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setOrient("h")}
            className={`rounded-full px-3 py-1 text-[10px] font-medium tracking-wider transition-colors ${
              orient === "h" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Horizontal
          </button>
          <button
            type="button"
            onClick={() => setOrient("v")}
            className={`rounded-full px-3 py-1 text-[10px] font-medium tracking-wider transition-colors ${
              orient === "v" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Vertical
          </button>
        </div>
      </div>
      <div
        className="aspect-square w-full rounded-lg p-2 shadow-inner"
        style={{ background: "var(--board-bg)" }}
      >
        <div
          className="grid h-full w-full gap-0"
          style={{
            gridTemplateColumns: tracks,
            gridTemplateRows: tracks,
          }}
        >
          {items}
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Click a highlighted square to move · click between cells to place a{" "}
        <strong>{orient === "h" ? "horizontal" : "vertical"}</strong> wall
      </p>
    </div>
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