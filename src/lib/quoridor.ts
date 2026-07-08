// Pure Quoridor engine — 2 or 4 players, no UI deps. Serializable state.
import type { ClockState } from "./clock";

export type PlayerId = 0 | 1 | 2 | 3;
export type Mode = 2 | 4;
export type Orient = "h" | "v";
export type Pos = [number, number];
export type WallSpec = { r: number; c: number; o: Orient };
export type Wall = WallSpec & { by: PlayerId };
export type Goal = { kind: "row" | "col"; value: number };

export type Move = { kind: "pawn"; to: Pos } | { kind: "wall"; wall: WallSpec };

export type MoveRecord = { move: Move; by: PlayerId };

export type GameState = {
  mode: Mode;
  pawns: Pos[];
  active: boolean[];              // active this round
  leftMatch: boolean[];           // permanently out for the rest of the match
  wallsLeft: number[];
  walls: Wall[];
  lastWall: Wall | null;
  turn: PlayerId;
  winner: PlayerId | null;
  totalWalls: number;
  score: number[];
  totalRounds: number;
  matchWinner: PlayerId | null;
  // per-match tallies (for end-screen summary)
  wallsPlacedByPlayer: number[];
  pawnsEliminatedByPlayer: number[];
  // Optional chess-style clocks. Host manages transitions; when present
  // every client renders live remaining time. Absent = no clock UI.
  clocks?: ClockState;
  // Why the current round ended (set when winner !== null). Used purely for
  // UI messaging; the engine never reads it back.
  endReason?: "goal" | "time" | "forfeit" | "afk";
  endLoser?: PlayerId;
  // Total moves played this round (pawn moves + wall placements).
  moveCount?: number;
  // Ordered move history for the current round. Used for post-game review.
  moves?: MoveRecord[];
};

export const BOARD = 9;

// Fallback names when a display name is missing.
export const PLAYER_NAMES = ["Gold", "Slate", "Crimson", "Jade"];

const STARTS_2: Pos[] = [[8, 4], [0, 4]];
const STARTS_4: Pos[] = [[8, 4], [0, 4], [4, 0], [4, 8]];
const GOALS_2: Goal[] = [{ kind: "row", value: 0 }, { kind: "row", value: 8 }];
const GOALS_4: Goal[] = [
  { kind: "row", value: 0 }, { kind: "row", value: 8 },
  { kind: "col", value: 8 }, { kind: "col", value: 0 },
];

export function startsFor(mode: Mode): Pos[] {
  return (mode === 2 ? STARTS_2 : STARTS_4).map((p) => [p[0], p[1]] as Pos);
}
export function goalsFor(mode: Mode): Goal[] { return mode === 2 ? GOALS_2 : GOALS_4; }
export function defaultWallsFor(mode: Mode): number { return mode === 2 ? 10 : 5; }
export function winsNeeded(totalRounds: number): number { return Math.floor(totalRounds / 2) + 1; }

export function initialState(mode: Mode = 2, totalWalls = defaultWallsFor(mode), totalRounds = 5): GameState {
  return {
    mode,
    pawns: startsFor(mode),
    active: Array.from({ length: mode }, () => true),
    leftMatch: Array.from({ length: mode }, () => false),
    wallsLeft: Array.from({ length: mode }, () => totalWalls),
    walls: [], lastWall: null, turn: 0, winner: null,
    totalWalls, score: Array.from({ length: mode }, () => 0),
    totalRounds, matchWinner: null,
    wallsPlacedByPlayer: Array.from({ length: mode }, () => 0),
    pawnsEliminatedByPlayer: Array.from({ length: mode }, () => 0),
    moveCount: 0,
    moves: [],
  };
}

export function newRound(state: GameState, starter: PlayerId): GameState {
  // Preserve leftMatch — those slots stay inactive for the rest of the match.
  const active = state.leftMatch.map((left) => !left);
  // Bump starter forward until we land on someone still in the match.
  let s: PlayerId = starter;
  for (let i = 0; i < state.mode; i++) {
    if (active[s]) break;
    s = ((s + 1) % state.mode) as PlayerId;
  }
  return {
    ...state,
    pawns: startsFor(state.mode),
    active,
    wallsLeft: state.wallsLeft.map((_, i) => (active[i] ? state.totalWalls : 0)),
    walls: [], lastWall: null, turn: s, winner: null,
    endReason: undefined, endLoser: undefined, moveCount: 0, moves: [],
  };
}

function inBounds(r: number, c: number) { return r >= 0 && r < BOARD && c >= 0 && c < BOARD; }

export function isBlocked(r: number, c: number, r2: number, c2: number, walls: Wall[]): boolean {
  const dr = r2 - r, dc = c2 - c;
  for (const w of walls) {
    if (dr === 0 && dc === 1) { if (w.o === "v" && w.c === c && (w.r === r || w.r === r - 1)) return true; }
    else if (dr === 0 && dc === -1) { if (w.o === "v" && w.c === c - 1 && (w.r === r || w.r === r - 1)) return true; }
    else if (dr === 1 && dc === 0) { if (w.o === "h" && w.r === r && (w.c === c || w.c === c - 1)) return true; }
    else if (dr === -1 && dc === 0) { if (w.o === "h" && w.r === r - 1 && (w.c === c || w.c === c - 1)) return true; }
  }
  return false;
}

export function legalPawnMoves(state: GameState, player: PlayerId): Pos[] {
  if (!state.active[player]) return [];
  const [r, c] = state.pawns[player];
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const results: Pos[] = [];
  const pushUnique = (p: Pos) => {
    if (!results.some(([a, b]) => a === p[0] && b === p[1])) results.push(p);
  };
  const occupantAt = (rr: number, cc: number): number => {
    for (let i = 0; i < state.mode; i++) {
      if (!state.active[i]) continue;
      if (state.pawns[i][0] === rr && state.pawns[i][1] === cc) return i;
    }
    return -1;
  };
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (isBlocked(r, c, nr, nc, state.walls)) continue;
    const occ = occupantAt(nr, nc);
    if (occ === -1) {
      pushUnique([nr, nc]);
      continue;
    }
    if (occ === player) continue;
    // Adjacent opponent — try to jump straight over.
    const jr = nr + dr, jc = nc + dc;
    const jumpInBounds = inBounds(jr, jc);
    const jumpWallClear = jumpInBounds && !isBlocked(nr, nc, jr, jc, state.walls);
    const jumpTargetFree = jumpInBounds && occupantAt(jr, jc) === -1;
    if (jumpInBounds && jumpWallClear && jumpTargetFree) {
      pushUnique([jr, jc]);
      continue;
    }
    // Straight jump blocked (edge, wall behind, or another pawn) — allow diagonals
    // to the squares perpendicular to the jump direction, from the opponent's square.
    const perps: Array<[number, number]> = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    for (const [pdr, pdc] of perps) {
      const dr2 = nr + pdr, dc2 = nc + pdc;
      if (!inBounds(dr2, dc2)) continue;
      if (isBlocked(nr, nc, dr2, dc2, state.walls)) continue;
      if (occupantAt(dr2, dc2) !== -1) continue;
      pushUnique([dr2, dc2]);
    }
  }
  return results;
}

export function reachedGoal(pos: Pos, goal: Goal): boolean {
  return goal.kind === "row" ? pos[0] === goal.value : pos[1] === goal.value;
}

function hasPathToGoal(from: Pos, goal: Goal, walls: Wall[]): boolean {
  if (reachedGoal(from, goal)) return true;
  const seen = new Set<string>();
  const q: Pos[] = [from]; seen.add(`${from[0]},${from[1]}`);
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (q.length) {
    const [r, c] = q.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      if (isBlocked(r, c, nr, nc, walls)) continue;
      seen.add(k);
      if (reachedGoal([nr, nc], goal)) return true;
      q.push([nr, nc]);
    }
  }
  return false;
}

export function wallConflicts(walls: Wall[], w: WallSpec): boolean {
  if (w.r < 0 || w.r > BOARD - 2 || w.c < 0 || w.c > BOARD - 2) return true;
  for (const e of walls) {
    if (e.o === w.o && e.r === w.r && e.c === w.c) return true;
    if (w.o === "h" && e.o === "h" && e.r === w.r && Math.abs(e.c - w.c) === 1) return true;
    if (w.o === "v" && e.o === "v" && e.c === w.c && Math.abs(e.r - w.r) === 1) return true;
    if (w.o !== e.o && e.r === w.r && e.c === w.c) return true;
  }
  return false;
}

export function canPlaceWall(state: GameState, player: PlayerId, w: WallSpec): boolean {
  if (state.winner !== null) return false;
  if (!state.active[player]) return false;
  if (state.wallsLeft[player] <= 0) return false;
  if (wallConflicts(state.walls, w)) return false;
  const next: Wall[] = [...state.walls, { ...w, by: player }];
  const goals = goalsFor(state.mode);
  for (let i = 0; i < state.mode; i++) {
    if (!state.active[i]) continue;
    if (!hasPathToGoal(state.pawns[i], goals[i], next)) return false;
  }
  return true;
}

function nextTurn(mode: Mode, active: boolean[], from: PlayerId): PlayerId {
  for (let i = 1; i <= mode; i++) {
    const t = ((from + i) % mode) as PlayerId;
    if (active[t]) return t;
  }
  return from;
}

export function applyMove(state: GameState, player: PlayerId, move: Move): GameState | null {
  if (state.winner !== null) return null;
  if (state.turn !== player) return null;
  if (!state.active[player]) return null;

  if (move.kind === "pawn") {
    const legal = legalPawnMoves(state, player);
    if (!legal.some(([a, b]) => a === move.to[0] && b === move.to[1])) return null;
    const pawns = state.pawns.map((p, i) => (i === player ? ([move.to[0], move.to[1]] as Pos) : p));
    const goals = goalsFor(state.mode);
    const active = [...state.active];
    let winner: PlayerId | null = null;
    if (reachedGoal(move.to, goals[player])) { winner = player; active[player] = false; }
    let score = state.score;
    let matchWinner = state.matchWinner;
    if (winner !== null) {
      score = [...state.score];
      score[winner] += 1;
      if (score[winner] >= winsNeeded(state.totalRounds)) matchWinner = winner;
    }
    return { ...state, pawns, active,
      turn: winner !== null ? player : nextTurn(state.mode, active, player),
      winner, score, matchWinner, moveCount: (state.moveCount ?? 0) + 1,
      moves: [...(state.moves ?? []), { move, by: player }] };
  } else {
    if (!canPlaceWall(state, player, move.wall)) return null;
    const placed: Wall = { ...move.wall, by: player };
    const wallsLeft = [...state.wallsLeft]; wallsLeft[player] -= 1;
    const wallsPlacedByPlayer = [...state.wallsPlacedByPlayer];
    wallsPlacedByPlayer[player] = (wallsPlacedByPlayer[player] ?? 0) + 1;
    return { ...state, walls: [...state.walls, placed], wallsLeft, lastWall: placed,
      turn: nextTurn(state.mode, state.active, player), wallsPlacedByPlayer,
      moveCount: (state.moveCount ?? 0) + 1,
      moves: [...(state.moves ?? []), { move, by: player }] };
  }
}

// Forfeit the current round. Optional `permanent` also marks the player out of
// the whole match (leaver / AFK timeout).
export function applyForfeit(state: GameState, player: PlayerId, permanent = false): GameState | null {
  if (state.matchWinner !== null) return null;
  if (!state.active[player] && !permanent) return null;
  const active = [...state.active];
  const leftMatch = [...state.leftMatch];
  const pawnsEliminatedByPlayer = [...state.pawnsEliminatedByPlayer];
  if (active[player]) {
    active[player] = false;
    // Whoever's turn it currently is "gets" this elimination for stats.
    const credit = state.turn;
    pawnsEliminatedByPlayer[credit] = (pawnsEliminatedByPlayer[credit] ?? 0) + 1;
  }
  if (permanent) leftMatch[player] = true;
  const remaining = active.map((v, i) => (v && !leftMatch[i] ? (i as PlayerId) : -1))
    .filter((i): i is PlayerId => i >= 0);
  let winner: PlayerId | null = state.winner;
  let score = state.score;
  let matchWinner: PlayerId | null = state.matchWinner;
  let turn = state.turn;
  if (state.winner === null) {
    if (remaining.length === 1) {
      winner = remaining[0];
      score = [...state.score]; score[winner] += 1;
      if (score[winner] >= winsNeeded(state.totalRounds)) matchWinner = winner;
      turn = winner;
    } else if (remaining.length === 0) {
      // Everyone left — no winner.
      winner = null;
    } else {
      turn = nextTurn(state.mode, active, player);
    }
  }
  // Also: if leaver leaves only one player left in the match overall → match win.
  const matchRemaining = leftMatch.map((l, i) => (!l ? (i as PlayerId) : -1))
    .filter((i): i is PlayerId => i >= 0);
  if (permanent && matchWinner === null && matchRemaining.length === 1) {
    matchWinner = matchRemaining[0];
  }
  return { ...state, active, leftMatch, winner, score, matchWinner, turn, pawnsEliminatedByPlayer };
}
