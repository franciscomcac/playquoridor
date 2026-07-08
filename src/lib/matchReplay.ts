// Replay a MatchSnapshot into an array of GameStates, one per ply. Also
// provides a canvas renderer used by the GIF exporter and the analyze page.
import {
  applyMove, initialState, newRound,
  type GameState, type PlayerId,
} from "@/lib/quoridor";
import type { MatchSnapshot } from "@/lib/matchHistory";

export type ReplayFrame = {
  state: GameState;
  roundIndex: number;
  plyIndex: number;   // index within the round, -1 for the initial frame
  by: PlayerId | null;
  isRoundEnd: boolean;
};

export function replay(snap: MatchSnapshot): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  let state = initialState(snap.mode, snap.totalWalls, snap.totalRounds);
  for (let r = 0; r < snap.rounds.length; r++) {
    const round = snap.rounds[r];
    state = r === 0
      ? { ...state, turn: round.startingSlot }
      : newRound(state, round.startingSlot);
    frames.push({ state, roundIndex: r, plyIndex: -1, by: null, isRoundEnd: false });
    for (let i = 0; i < round.moves.length; i++) {
      const mr = round.moves[i];
      const next = applyMove(state, mr.by, mr.move);
      if (!next) break; // corrupt snapshot; bail this round
      state = next;
      frames.push({
        state, roundIndex: r, plyIndex: i,
        by: mr.by,
        isRoundEnd: i === round.moves.length - 1 && state.winner !== null,
      });
    }
  }
  return frames;
}

// Simple, compact renderer used for both the GIF and the analyze thumbnails.
// No React, no rotation — pure top-down draw.
export const PLAYER_HEX = ["#e8b84a", "#7a94c8", "#c86464", "#78c896"];
const BG = "#0b0b10";
const CELL_BG = "#1a1a22";
const CELL_ALT = "#141420";
const GRID = "#2b2b3a";
const WALL_NEUTRAL = "#e8dfa8";

// Tint a player's wall so it reads clearly on the dark board while still
// keeping the player's colour identifiable.
function wallColorFor(by: number | undefined): string {
  const base = by == null ? WALL_NEUTRAL : PLAYER_HEX[by] ?? WALL_NEUTRAL;
  return base;
}

export function drawState(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
): void {
  const N = 9;
  const pad = Math.round(Math.min(width, height) * 0.06);
  const size = Math.min(width, height) - pad * 2;
  const cell = size / N;
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Cells
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? CELL_BG : CELL_ALT;
      ctx.fillRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
    }
  }

  // Grid lines
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    ctx.moveTo(ox + i * cell, oy);
    ctx.lineTo(ox + i * cell, oy + size);
    ctx.moveTo(ox, oy + i * cell);
    ctx.lineTo(ox + size, oy + i * cell);
  }
  ctx.stroke();

  // Walls
  const wallThick = Math.max(3, Math.round(cell * 0.16));
  for (const w of state.walls) {
    ctx.fillStyle = wallColorFor((w as unknown as { by?: number }).by);
    if (w.o === "h") {
      const x = ox + w.c * cell;
      const y = oy + (w.r + 1) * cell - wallThick / 2;
      ctx.fillRect(x + 2, y, cell * 2 - 4, wallThick);
    } else {
      const x = ox + (w.c + 1) * cell - wallThick / 2;
      const y = oy + w.r * cell;
      ctx.fillRect(x, y + 2, wallThick, cell * 2 - 4);
    }
  }

  // Pawns
  const pR = cell * 0.32;
  for (let i = 0; i < state.mode; i++) {
    if (!state.active[i] && state.matchWinner === null) continue;
    const [r, c] = state.pawns[i];
    const cx = ox + c * cell + cell / 2;
    const cy = oy + r * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, pR, 0, Math.PI * 2);
    ctx.fillStyle = PLAYER_HEX[i] ?? "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#00000080";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}