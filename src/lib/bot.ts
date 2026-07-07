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
  const bestD = scored[0].d;
  const bestGroup = scored.filter((s) => s.d === bestD);
  const bestPawn: Move = {
    kind: "pawn",
    to: bestGroup[Math.floor(Math.random() * bestGroup.length)].to,
  };
  // A "sound" pawn choice: always the best-by-distance move, but sometimes
  // (on easier difficulties) a move that costs only one extra step. Never
  // a backwards or clearly losing move.
  const nearBest = scored.filter((s) => s.d <= bestD + 1);
  const subOptChance = Math.max(0, 0.28 - difficulty * 0.24);
  const pickPawn = (): Move => {
    if (nearBest.length > bestGroup.length && Math.random() < subOptChance) {
      const alt = nearBest[Math.floor(Math.random() * nearBest.length)];
      return { kind: "pawn", to: alt.to };
    }
    return bestPawn;
  };

  // Decide whether to consider a wall this turn.
  const wallChance = 0.15 + difficulty * 0.5; // easy ~0.26, hard ~0.65
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
            // Never build a wall that lengthens our own path — that always
            // looks like a blunder to an observer.
            if (myD2 > myDNow) continue;
            let gain = -(myD2 - myDNow);
            for (let i = 0; i < opps.length; i++) {
              const oppD2 = bfsDist(state.pawns[opps[i]], goals[opps[i]], walls2);
              gain += (oppD2 - oppDNow[i]);
            }
            if (gain > bestGain) { bestGain = gain; bestWall = w; }
          }
        }
      }
      // Only spend a wall when it clearly slows the opponent more than the
      // (already zero-or-better) cost to us. Easier players demand a
      // stronger gain because they lean on walking.
      const threshold = difficulty < 0.4 ? 2 : 1;
      if (bestWall && bestGain >= threshold) {
        return { kind: "wall", wall: bestWall };
      }
    }
  }
  return pickPawn();
}

// How long a real person would look at the board before playing `move`.
// Bigger for walls (strategic decisions), for wall-rich positions, and for
// the first few moves of a round. Adds jitter, occasional "big think",
// and rare "snap" moves so it never feels metronomic.
export function humanThinkTimeMs(state: GameState, move: Move, difficulty: number): number {
  let base: number;
  if (move.kind === "wall") {
    base = 1800 + Math.random() * 1900;                   // walls: 1.8–3.7s
  } else {
    base = 900 + Math.random() * 1200;                     // pawns: 0.9–2.1s
  }
  // Complex boards take longer to read.
  const clutter = Math.min(1, state.walls.length / 12);    // 0..1
  base += clutter * 700;
  // Higher-difficulty "player" looks a touch longer on strategic turns.
  base += difficulty * 250;
  // First couple of moves in a round: a real player sizes up the board
  // before committing, so we linger a bit rather than snap-moving.
  if (state.walls.length < 3) base += 900 + Math.random() * 900;
  // Rare big think.
  if (Math.random() < 0.05) base += 1500 + Math.random() * 2200;
  // Occasional quick reply (only after the opening — a real player never
  // slams out an instant move on move 1).
  if (state.walls.length >= 3 && Math.random() < 0.06) {
    base = Math.min(base, 650 + Math.random() * 300);
  }
  // Cap so the game never stalls.
  return Math.max(750, Math.min(base, 6000));
}
