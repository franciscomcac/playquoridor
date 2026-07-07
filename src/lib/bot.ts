// Local Quoridor AI opponent. Pure functions — no UI or I/O.
// Difficulty is a number in [0..1]: 0 = nearly random, 1 = strong-ish.
import {
  BOARD, canPlaceWall, goalsFor, isBlocked, legalPawnMoves, reachedGoal,
  type GameState, type Goal, type Move, type Orient, type PlayerId,
  type Pos, type Wall,
} from "./quoridor";

export type BotDifficulty = { label: "Easy" | "Medium" | "Hard"; value: number };

export function randomDifficulty(): BotDifficulty {
  const r = Math.random();
  // Fluctuate each game: mostly medium, sometimes easy or hard.
  if (r < 0.3) return { label: "Easy", value: 0.22 + Math.random() * 0.13 };
  if (r < 0.8) return { label: "Medium", value: 0.5 + Math.random() * 0.15 };
  return { label: "Hard", value: 0.82 + Math.random() * 0.13 };
}

// Shortest number of steps from `from` to reach `goal` given `walls`.
// Returns Infinity when unreachable (shouldn't happen given wall legality).
function bfsDist(from: Pos, goal: Goal, walls: Wall[]): number {
  if (reachedGoal(from, goal)) return 0;
  const seen = new Uint8Array(BOARD * BOARD);
  seen[from[0] * BOARD + from[1]] = 1;
  const q: Array<[number, number, number]> = [[from[0], from[1], 0]];
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (q.length) {
    const [r, c, d] = q.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= BOARD || nc < 0 || nc >= BOARD) continue;
      const idx = nr * BOARD + nc;
      if (seen[idx]) continue;
      if (isBlocked(r, c, nr, nc, walls)) continue;
      if (reachedGoal([nr, nc], goal)) return d + 1;
      seen[idx] = 1;
      q.push([nr, nc, d + 1]);
    }
  }
  return Infinity;
}

export function pickBotMove(state: GameState, bot: PlayerId, difficulty: number): Move | null {
  if (state.winner !== null || state.matchWinner !== null) return null;
  if (!state.active[bot]) return null;
  const legal = legalPawnMoves(state, bot);
  if (legal.length === 0) return null;

  const goals = goalsFor(state.mode);
  const myGoal = goals[bot];

  // Score legal pawn moves by resulting distance to my goal.
  const scored = legal
    .map((to) => ({ to, d: bfsDist(to, myGoal, state.walls) }))
    .sort((a, b) => a.d - b.d);
  const bestPawn: Move = { kind: "pawn", to: scored[0].to };
  const randomPawn: Move = { kind: "pawn", to: legal[Math.floor(Math.random() * legal.length)] };

  // Add pure randomness for lower difficulty tiers.
  const blunderChance = Math.max(0, 0.55 - difficulty * 0.55); // easy ~0.43, hard ~0.05
  if (Math.random() < blunderChance) return randomPawn;

  // Decide whether to consider a wall this turn.
  const wallChance = 0.1 + difficulty * 0.55; // easy ~0.22, hard ~0.65
  if (state.wallsLeft[bot] > 0 && Math.random() < wallChance) {
    const opps: PlayerId[] = [];
    for (let i = 0; i < state.mode; i++) {
      if (i !== bot && state.active[i]) opps.push(i as PlayerId);
    }
    if (opps.length > 0) {
      const myDNow = bfsDist(state.pawns[bot], myGoal, state.walls);
      const oppDNow = opps.map((o) => bfsDist(state.pawns[o], goals[o], state.walls));
      let bestWall: { r: number; c: number; o: Orient } | null = null;
      let bestGain = -Infinity;
      const orients: Orient[] = ["h", "v"];
      for (let r = 0; r < BOARD - 1; r++) {
        for (let c = 0; c < BOARD - 1; c++) {
          for (const o of orients) {
            const w = { r, c, o };
            if (!canPlaceWall(state, bot, w)) continue;
            const walls2: Wall[] = [...state.walls, { ...w, by: bot }];
            const myD2 = bfsDist(state.pawns[bot], myGoal, walls2);
            let gain = -(myD2 - myDNow);
            for (let i = 0; i < opps.length; i++) {
              const oppD2 = bfsDist(state.pawns[opps[i]], goals[opps[i]], walls2);
              gain += (oppD2 - oppDNow[i]);
            }
            if (gain > bestGain) { bestGain = gain; bestWall = w; }
          }
        }
      }
      // Higher difficulty demands the wall be more clearly worth it.
      const threshold = difficulty < 0.4 ? 0 : difficulty < 0.75 ? 1 : 2;
      if (bestWall && bestGain >= threshold) {
        return { kind: "wall", wall: bestWall };
      }
    }
  }
  return bestPawn;
}
