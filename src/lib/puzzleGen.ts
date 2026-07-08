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

  // Pawn starts slightly forward for variety, opponent stays at row 0.
  const startRow = 6 + Math.floor(rng() * 3); // 6..8
  const startCol = 2 + Math.floor(rng() * 5); // 2..6
  let pawn: Pos = [startRow, startCol];
  const other: Pos = [0, 4];
  const pawns: Pos[] = [pawn, other];

  const targetWalls = ({ 1: 4, 2: 8, 3: 12 } as const)[difficulty];
  const walls: Wall[] = [];
  let attempts = 0;
  while (walls.length < targetWalls && attempts < 600) {
    attempts++;
    const r = Math.floor(rng() * (BOARD - 1));
    const c = Math.floor(rng() * (BOARD - 1));
    const o: "h" | "v" = rng() < 0.5 ? "h" : "v";
    const spec: WallSpec = { r, c, o };
    if (wallConflicts(walls, spec)) continue;
    const test: Wall[] = [...walls, { ...spec, by: 0 }];
    // Both players must still have a path.
    if (!hasPathToGoal(pawns[0], goals[0], test)) continue;
    if (!hasPathToGoal(pawns[1], goals[1], test)) continue;
    // Path must not be too short — keep it interesting.
    if (shortestPathToGoal(pawns[0], goals[0], test) < 3) continue;
    walls.push({ ...spec, by: 0 });
  }

  // If we somehow lost the path, fall back to canonical start.
  if (!hasPathToGoal(pawn, goals[0], walls)) {
    pawn = [8, 4];
    pawns[0] = pawn;
  }

  const dist = shortestPathToGoal(pawn, goals[0], walls);
  const slack = 1 + Math.floor(rng() * 3); // 1..3 extra moves allowed
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