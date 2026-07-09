// Fog of Walls — client-side visibility from a viewer's pawn.
//
// Rules:
//  - Walls placed by the viewer are always visible.
//  - Any other wall becomes visible once one of its 4 adjacent cells has
//    been "seen" — i.e. reachable from the viewer's current pawn within
//    FOG_RADIUS steps, respecting walls (not phasing through them).
//  - Visibility is monotonic: once revealed, a wall stays revealed for the
//    rest of the round.
//
// Pawns are always visible (see design decision — walls-only fog).
import { BOARD, isBlocked, type GameState, type PlayerId, type Wall } from "./quoridor";

export const FOG_RADIUS = 3;

export function wallKey(w: { o: string; r: number; c: number }): string {
  return `${w.o}-${w.r}-${w.c}`;
}

function reachableCells(state: GameState, from: [number, number], radius: number): Set<number> {
  const seen = new Set<number>();
  const [sr, sc] = from;
  const start = sr * BOARD + sc;
  seen.add(start);
  const q: Array<[number, number, number]> = [[sr, sc, 0]];
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (q.length) {
    const [r, c, d] = q.shift()!;
    if (d >= radius) continue;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= BOARD || nc < 0 || nc >= BOARD) continue;
      const idx = nr * BOARD + nc;
      if (seen.has(idx)) continue;
      if (isBlocked(r, c, nr, nc, state.walls)) continue;
      seen.add(idx);
      q.push([nr, nc, d + 1]);
    }
  }
  return seen;
}

// Cells adjacent to a wall segment (both sides it separates).
function wallAdjacentCells(w: Wall | { o: "h" | "v"; r: number; c: number }): Array<[number, number]> {
  if (w.o === "h") {
    // Horizontal wall between rows r and r+1, spanning columns c and c+1.
    return [[w.r, w.c], [w.r, w.c + 1], [w.r + 1, w.c], [w.r + 1, w.c + 1]];
  }
  // Vertical wall between columns c and c+1, spanning rows r and r+1.
  return [[w.r, w.c], [w.r + 1, w.c], [w.r, w.c + 1], [w.r + 1, w.c + 1]];
}

/** Compute the currently-visible wall keys for `viewer`, unioned with `prior`. */
export function computeVisibleWalls(
  state: GameState,
  viewer: PlayerId,
  prior: Set<string> = new Set(),
): Set<string> {
  const out = new Set(prior);
  const seen = reachableCells(state, state.pawns[viewer], FOG_RADIUS);
  for (const w of state.walls) {
    const k = wallKey(w);
    if (out.has(k)) continue;
    if (w.by === viewer) { out.add(k); continue; }
    for (const [r, c] of wallAdjacentCells(w)) {
      if (seen.has(r * BOARD + c)) { out.add(k); break; }
    }
  }
  return out;
}

/** Sight overlay: cells the viewer can currently "see". Used for optional
 *  board dimming so the player knows what's fogged. */
export function computeVisibleCells(state: GameState, viewer: PlayerId): Set<number> {
  return reachableCells(state, state.pawns[viewer], FOG_RADIUS);
}