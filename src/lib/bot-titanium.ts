// "Titanium" engine — TS iterative-deepening alpha-beta with transposition
// table and shortest-path evaluation. Designed for 2-player play; 4p falls
// back to the classic bot in bot.ts.
//
// Time-budgeted: search deepens from 1 ply until the budget expires, then
// returns the best move found at the last completed depth. Move ordering
// prefers pawn steps toward goal and walls near the opponent, which makes
// alpha-beta prune aggressively.
import {
  BOARD, canPlaceWall, goalsFor, isBlocked, legalPawnMoves,
  reachedGoal, shortestPathToGoal,
  type GameState, type Move, type Orient, type PlayerId,
  type Pos, type Wall, type WallSpec,
} from "./quoridor";

type MoveGen = { move: Move; sortKey: number };

const INF = 1e9;

function otherOf(mode: 2, p: PlayerId): PlayerId {
  return (p === 0 ? 1 : 0) as PlayerId;
}

function evalState(state: GameState, me: PlayerId): number {
  const opp = otherOf(2, me);
  const goals = goalsFor(state.mode);
  const myD = shortestPathToGoal(state.pawns[me], goals[me], state.walls);
  const opD = shortestPathToGoal(state.pawns[opp], goals[opp], state.walls);
  if (!isFinite(myD)) return -INF / 2;
  if (!isFinite(opD)) return INF / 2;
  if (reachedGoal(state.pawns[me], goals[me])) return INF / 2;
  if (reachedGoal(state.pawns[opp], goals[opp])) return -INF / 2;
  // Path lead dominates; wall reserve is a modest tiebreak; tempo tiny.
  const pathLead = (opD - myD) * 12;
  const wallDiff = (state.wallsLeft[me] - state.wallsLeft[opp]) * 2;
  const tempo = state.turn === me ? 1 : -1;
  return pathLead + wallDiff + tempo;
}

function applyMoveFast(state: GameState, mover: PlayerId, move: Move): GameState | null {
  // Local, allocation-lean applyMove that skips history/scoring bookkeeping.
  if (state.winner !== null) return null;
  if (state.turn !== mover) return null;
  const goals = goalsFor(state.mode);
  if (move.kind === "pawn") {
    const legal = legalPawnMoves(state, mover);
    if (!legal.some(([r, c]) => r === move.to[0] && c === move.to[1])) return null;
    const pawns = state.pawns.map((p, i) =>
      i === mover ? ([move.to[0], move.to[1]] as Pos) : ([p[0], p[1]] as Pos),
    );
    const winner = reachedGoal(move.to, goals[mover]) ? mover : null;
    return {
      ...state, pawns,
      turn: (winner !== null ? mover : ((mover + 1) % state.mode)) as PlayerId,
      winner,
    };
  }
  if (!canPlaceWall(state, mover, move.wall)) return null;
  const placed: Wall = { ...move.wall, by: mover };
  const wallsLeft = [...state.wallsLeft];
  wallsLeft[mover] -= 1;
  return {
    ...state,
    walls: [...state.walls, placed],
    wallsLeft, lastWall: placed,
    turn: ((mover + 1) % state.mode) as PlayerId,
  };
}

function generateMoves(state: GameState, mover: PlayerId, opp: PlayerId, wallBudget: number): MoveGen[] {
  const out: MoveGen[] = [];
  const goals = goalsFor(state.mode);
  const myGoal = goals[mover];
  const oppPos = state.pawns[opp];

  // Pawn moves — ordered by resulting shortest-path distance ascending.
  const pawnMoves = legalPawnMoves(state, mover);
  for (const to of pawnMoves) {
    const d = shortestPathToGoal(to, myGoal, state.walls);
    out.push({ move: { kind: "pawn", to }, sortKey: -1000 + d });
  }

  if (state.wallsLeft[mover] <= 0) return out;

  // Wall candidates near the opponent (top wallBudget by heuristic).
  const cands: MoveGen[] = [];
  const orients: Orient[] = ["h", "v"];
  for (let r = 0; r < BOARD - 1; r++) {
    for (let c = 0; c < BOARD - 1; c++) {
      const distToOpp = Math.abs(r - oppPos[0]) + Math.abs(c - oppPos[1]);
      if (distToOpp > 3) continue;
      for (const o of orients) {
        const w: WallSpec = { r, c, o };
        if (!canPlaceWall(state, mover, w)) continue;
        cands.push({ move: { kind: "wall", wall: w }, sortKey: distToOpp });
      }
    }
  }
  cands.sort((a, b) => a.sortKey - b.sortKey);
  for (const c of cands.slice(0, wallBudget)) out.push(c);

  // Sort so "obviously good" moves (low sortKey) come first for alpha-beta.
  out.sort((a, b) => a.sortKey - b.sortKey);
  return out;
}

// Simple string hash for transposition. Walls set is order-independent.
function hashState(state: GameState, mover: PlayerId): string {
  const walls = state.walls
    .map((w) => `${w.o}${w.r}${w.c}`)
    .sort()
    .join("|");
  const pawns = state.pawns.map((p) => `${p[0]}${p[1]}`).join(",");
  return `${mover}:${pawns}:${state.wallsLeft.join(",")}:${walls}`;
}

type TTEntry = { depth: number; value: number; best?: Move };

export type TitaniumOptions = {
  /** Hard time cap in ms. */
  budgetMs?: number;
  /** Maximum wall candidates considered per node (higher = stronger, slower). */
  wallBudget?: number;
  /** Max iterative-deepening depth. */
  maxDepth?: number;
};

export function pickTitaniumMove(
  state: GameState,
  me: PlayerId,
  opts: TitaniumOptions = {},
): Move | null {
  if (state.mode !== 2) return null; // 2p only
  if (state.winner !== null || state.matchWinner !== null) return null;
  if (state.turn !== me) return null;
  const legal = legalPawnMoves(state, me);
  if (legal.length === 0) return null;

  const budgetMs = opts.budgetMs ?? 400;
  const wallBudget = opts.wallBudget ?? 12;
  const maxDepth = opts.maxDepth ?? 4;
  const deadline = Date.now() + budgetMs;
  const tt = new Map<string, TTEntry>();
  const opp = otherOf(2, me);

  const rootMoves = generateMoves(state, me, opp, wallBudget);
  if (rootMoves.length === 0) return null;

  let bestMove: Move = rootMoves[0].move;
  let bestScore = -INF;

  const search = (s: GameState, mover: PlayerId, depth: number, alpha: number, beta: number): number => {
    if (Date.now() > deadline) throw new Error("timeout");
    if (s.winner !== null) return s.winner === me ? INF / 2 : -INF / 2;
    if (depth === 0) return evalState(s, me);
    const key = `${depth}:${hashState(s, mover)}`;
    const cached = tt.get(key);
    if (cached && cached.depth >= depth) return cached.value;

    const isMax = mover === me;
    const opps = isMax ? opp : me;
    const moves = generateMoves(s, mover, opps, wallBudget);
    if (moves.length === 0) return evalState(s, me);

    let value = isMax ? -INF : INF;
    let bestLocal: Move | undefined;
    for (const m of moves) {
      const ns = applyMoveFast(s, mover, m.move);
      if (!ns) continue;
      const v = search(ns, ((mover + 1) % 2) as PlayerId, depth - 1, alpha, beta);
      if (isMax) {
        if (v > value) { value = v; bestLocal = m.move; }
        if (value > alpha) alpha = value;
      } else {
        if (v < value) { value = v; bestLocal = m.move; }
        if (value < beta) beta = value;
      }
      if (alpha >= beta) break;
    }
    tt.set(key, { depth, value, best: bestLocal });
    return value;
  };

  // Iterative deepening — best move so far is preserved across depths.
  try {
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INF, beta = INF;
      let localBest = rootMoves[0].move;
      let localBestScore = -INF;
      for (const m of rootMoves) {
        const ns = applyMoveFast(state, me, m.move);
        if (!ns) continue;
        const v = search(ns, opp, depth - 1, alpha, beta);
        if (v > localBestScore) { localBestScore = v; localBest = m.move; }
        if (localBestScore > alpha) alpha = localBestScore;
      }
      bestMove = localBest;
      bestScore = localBestScore;
      // Early exit on forced win/loss.
      if (bestScore > INF / 4 || bestScore < -INF / 4) break;
    }
  } catch (_e) {
    // Timeout — return best found so far.
  }

  void bestScore;
  return bestMove;
}

// Detect if any wall between the two pawn cells blocks movement (unused
// helper kept for potential eval extensions).
export function _isBlocked(r: number, c: number, r2: number, c2: number, walls: Wall[]) {
  return isBlocked(r, c, r2, c2, walls);
}