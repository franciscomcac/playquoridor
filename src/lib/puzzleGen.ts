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
  /** Wall budget the human player is given. Opponent has 0 walls. */
  playerWalls: number;
  /** Wall budget the opponent bot is given. */
  oppWalls: number;
  /** Opponent's shortest-path distance at start (informational). */
  oppSteps: number;
  /** Your shortest-path distance at start (informational). */
  yourSteps: number;
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
 * Generate a RACE puzzle: player 0 (you, row 0 goal) and player 1 (opponent,
 * row 8 goal) both race. The opponent auto-plays shortest-path and cannot
 * place walls. You are given a small wall budget. To win the race you must
 * place walls that slow the opponent more than they slow you.
 *
 * Difficulty controls how many pre-placed walls sit on the board and how
 * tight the race is. Easier puzzles give you more of an advantage; harder
 * puzzles require efficient wall use.
 */
export function generatePuzzle(seed: number, difficulty: 1 | 2 | 3 = 2): GeneratedPuzzle {
  const rng = seededRng(seed);
  const mode = 2 as const;
  const goals = goalsFor(mode);

  // Wall budget for the human player. Opponent has none (pure race bot).
  const playerWalls = ({ 1: 4, 2: 3, 3: 2 } as const)[difficulty];
  // Opponent bot wall budget. More walls at higher difficulty so the
  // opponent can actively block you back — makes the puzzle interactive
  // rather than a pure race against a straight-line runner.
  const oppWalls    = ({ 1: 1, 2: 2, 3: 3 } as const)[difficulty];
  // Pre-placed walls to give the board some structure.
  const preWalls    = ({ 1: 2, 2: 4, 3: 6 } as const)[difficulty];
  // How much closer to their goal the opponent starts than you do.
  // Larger = harder (you must wall to catch up in the race).
  const oppLead     = ({ 1: 0, 2: 1, 3: 2 } as const)[difficulty];

  const you: Pos = [8, 3 + Math.floor(rng() * 3)];      // row 8, col 3..5
  // Opponent starts oppLead+1 rows below their own start (row 0) to trim
  // their path by that many rows. Position them off-column from you so
  // they don't sit directly in your lane.
  const oppRow = Math.min(BOARD - 2, 1 + oppLead);      // 1..3
  const oppColBase = 3 + Math.floor(rng() * 3);         // 3..5
  const oppCol = oppColBase === you[1] ? (oppColBase + (rng() < 0.5 ? -1 : 1) + BOARD) % BOARD : oppColBase;
  const opp: Pos = [oppRow, oppCol];
  const pawns: Pos[] = [you, opp];

  // Add pre-placed walls. Prefer walls that lengthen the OPPONENT's path
  // roughly as much as the player's, so the position feels balanced.
  const walls: Wall[] = [];
  let attempts = 0;
  while (walls.length < preWalls && attempts < 800) {
    attempts++;
    const r = Math.floor(rng() * (BOARD - 1));
    const c = Math.floor(rng() * (BOARD - 1));
    const o: "h" | "v" = rng() < 0.5 ? "h" : "v";
    const spec: WallSpec = { r, c, o };
    if (wallConflicts(walls, spec)) continue;
    const test: Wall[] = [...walls, { ...spec, by: 0 }];
    if (!hasPathToGoal(you, goals[0], test)) continue;
    if (!hasPathToGoal(opp, goals[1], test)) continue;
    walls.push({ ...spec, by: 0 });
  }

  const yourSteps = shortestPathToGoal(you, goals[0], walls);
  const oppSteps  = shortestPathToGoal(opp, goals[1], walls);

  return {
    id: `race-${seed.toString(16)}`,
    title: "Race Puzzle",
    mode,
    pawns,
    walls,
    active_player: 0,
    playerWalls,
    oppWalls,
    oppSteps,
    yourSteps,
  };
}

export function buildPuzzleGameState(p: GeneratedPuzzle | {
  mode: number; pawns: Pos[]; walls: Wall[]; active_player: number;
  playerWalls?: number; oppWalls?: number;
}): GameState {
  const mode = (p.mode === 4 ? 4 : 2) as 2 | 4;
  const pawns = p.pawns.map((pp) => [pp[0], pp[1]] as Pos);
  const playerWalls = "playerWalls" in p && typeof p.playerWalls === "number" ? p.playerWalls : 0;
  const oppWalls = "oppWalls" in p && typeof p.oppWalls === "number" ? p.oppWalls : 0;
  const wallsLeft = Array.from({ length: mode }, (_, i) => (i === 0 ? playerWalls : i === 1 ? oppWalls : 0));
  return {
    mode,
    pawns,
    active: Array.from({ length: mode }, () => true),
    leftMatch: Array.from({ length: mode }, () => false),
    wallsLeft,
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