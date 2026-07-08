// Deterministic, seeded puzzle generator. Produces valid single-pawn
// Quoridor puzzles (fixed walls; player must reach their goal row in a
// target number of moves). Same seed → same puzzle, so a date seed gives
// a stable "daily" puzzle even without a DB row.
import {
  BOARD,
  defaultWallsFor,
  goalsFor,
  isBlocked,
  reachedGoal,
  shortestPathToGoal,
  wallConflicts,
  type GameState,
  type Pos,
  type Wall,
  type WallSpec,
} from "@/lib/quoridor";

// hasPathToGoal isn't exported from quoridor.ts, so inline a copy that
// uses the public isBlocked helper. Keeps generator dep-free.
function hasPathToGoal(from: Pos, goal: { kind: "row" | "col"; value: number }, walls: Wall[]): boolean {
  if (reachedGoal(from, goal)) return true;
  const seen = new Set<string>();
  const q: Pos[] = [from];
  seen.add(`${from[0]},${from[1]}`);
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (q.length) {
    const [r, c] = q.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= BOARD || nc < 0 || nc >= BOARD) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      if (isBlocked(r, c, nr, nc, walls)) continue;
      if (reachedGoal([nr, nc], goal)) return true;
      seen.add(k);
      q.push([nr, nc]);
    }
  }
  return false;
}

export type GeneratedPuzzle = {
  id: string;
  title: string;
  mode: 2;
  pawns: Pos[];
  walls: Wall[];
  active_player: 0;
  goal_moves: number;
};

function seededRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 1_000_000) / 1_000_000;
  };
}

export function seedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedFromDate(dateISO: string): number {
  return seedFromString(`quoridor:${dateISO}`);
}

/**
 * Generate a warm-up puzzle: player 0 must reach row 0.
 * Difficulty roughly controls wall count (5–13).
 */
export function generatePuzzle(seed: number, difficulty: 1 | 2 | 3 = 2): GeneratedPuzzle {
  const rng = seededRng(seed);
  const mode = 2 as const;
  const goals = goalsFor(mode);

  // Pawn starts further back to force longer, mazier paths.
  const startRow = 7 + Math.floor(rng() * 2); // 7..8
  const startCol = 1 + Math.floor(rng() * 7); // 1..7
  let pawn: Pos = [startRow, startCol];
  // Opponent pawn placed as an in-path obstacle near the middle band.
  const otherRow = 3 + Math.floor(rng() * 3); // 3..5
  const otherCol = 2 + Math.floor(rng() * 5); // 2..6
  const other: Pos = [otherRow, otherCol];
  const pawns: Pos[] = [pawn, other];

  // Way more walls, and prefer configurations that lengthen the path.
  const targetWalls = ({ 1: 10, 2: 15, 3: 18 } as const)[difficulty];
  const minPathLen  = ({ 1: 10, 2: 14, 3: 18 } as const)[difficulty];
  const walls: Wall[] = [];
  let attempts = 0;
  const maxAttempts = 4000;
  while (walls.length < targetWalls && attempts < maxAttempts) {
    attempts++;
    const r = Math.floor(rng() * (BOARD - 1));
    const c = Math.floor(rng() * (BOARD - 1));
    const o: "h" | "v" = rng() < 0.5 ? "h" : "v";
    const spec: WallSpec = { r, c, o };
    if (wallConflicts(walls, spec)) continue;
    const test: Wall[] = [...walls, { ...spec, by: 0 }];
    if (!hasPathToGoal(pawns[0], goals[0], test)) continue;
    if (!hasPathToGoal(pawns[1], goals[1], test)) continue;
    const before = shortestPathToGoal(pawns[0], goals[0], walls);
    const after  = shortestPathToGoal(pawns[0], goals[0], test);
    // Prefer walls that meaningfully lengthen the player's path. Once we
    // already have a mazy board (path >= minPathLen), accept neutral walls
    // too so we still hit the wall target.
    if (after < before + 1 && before < minPathLen && rng() > 0.15) continue;
    walls.push({ ...spec, by: 0 });
  }

  if (!hasPathToGoal(pawn, goals[0], walls)) {
    pawn = [8, 4];
    pawns[0] = pawn;
  }

  const dist = shortestPathToGoal(pawn, goals[0], walls);
  // Tight budget: exact shortest, or +1 at most. No brute-force slack.
  const slack = rng() < 0.6 ? 0 : 1;
  const goal_moves = Math.max(1, dist + slack);

  return {
    id: `gen-${seed.toString(16)}`,
    title: "Warm-up Puzzle",
    mode,
    pawns,
    walls,
    active_player: 0,
    goal_moves,
  };
}

export function buildPuzzleGameState(p: GeneratedPuzzle | {
  mode: number; pawns: Pos[]; walls: Wall[]; active_player: number;
}): GameState {
  const mode = (p.mode === 4 ? 4 : 2) as 2 | 4;
  const pawns = p.pawns.map((pp) => [pp[0], pp[1]] as Pos);
  return {
    mode,
    pawns,
    active: Array.from({ length: mode }, () => true),
    leftMatch: Array.from({ length: mode }, () => false),
    wallsLeft: Array.from({ length: mode }, () => 0),
    walls: p.walls.map((w) => ({ r: w.r, c: w.c, o: w.o, by: (w.by ?? 1) as 0 | 1 | 2 | 3 })),
    lastWall: null,
    turn: (p.active_player as 0 | 1 | 2 | 3) ?? 0,
    winner: null,
    totalWalls: defaultWallsFor(mode),
    score: Array.from({ length: mode }, () => 0),
    totalRounds: 1,
    matchWinner: null,
    wallsPlacedByPlayer: Array.from({ length: mode }, () => 0),
    pawnsEliminatedByPlayer: Array.from({ length: mode }, () => 0),
    moveCount: 0,
  };
}