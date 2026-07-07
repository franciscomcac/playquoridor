// Pure Quoridor engine — 2 or 4 players, no UI deps. All state is
// serializable so it can travel over the peer-to-peer wire as-is.

export type PlayerId = 0 | 1 | 2 | 3;
export type Mode = 2 | 4;
export type Orient = "h" | "v";
export type Pos = [number, number];
export type WallSpec = { r: number; c: number; o: Orient };
export type Wall = WallSpec & { by: PlayerId };
export type Goal = { kind: "row" | "col"; value: number };

export type Move =
  | { kind: "pawn"; to: Pos }
  | { kind: "wall"; wall: WallSpec };

export type GameState = {
  mode: Mode;
  pawns: Pos[];
  active: boolean[];
  wallsLeft: number[];
  walls: Wall[];
  lastWall: Wall | null;
  turn: PlayerId;
  winner: PlayerId | null;
  totalWalls: number;
  score: number[];
  totalRounds: number;
  matchWinner: PlayerId | null;
};

export const BOARD = 9;

export const PLAYER_NAMES = ["Gold", "Slate", "Crimson", "Jade"];

const STARTS_2: Pos[] = [
  [8, 4],
  [0, 4],
];
const STARTS_4: Pos[] = [
  [8, 4],
  [0, 4],
  [4, 0],
  [4, 8],
];
const GOALS_2: Goal[] = [
  { kind: "row", value: 0 },
  { kind: "row", value: 8 },
];
const GOALS_4: Goal[] = [
  { kind: "row", value: 0 },
  { kind: "row", value: 8 },
  { kind: "col", value: 8 },
  { kind: "col", value: 0 },
];

export function startsFor(mode: Mode): Pos[] {
  return (mode === 2 ? STARTS_2 : STARTS_4).map((p) => [p[0], p[1]] as Pos);
}

export function goalsFor(mode: Mode): Goal[] {
  return mode === 2 ? GOALS_2 : GOALS_4;
}

export function defaultWallsFor(mode: Mode): number {
  return mode === 2 ? 10 : 5;
}

export function winsNeeded(totalRounds: number): number {
  return Math.floor(totalRounds / 2) + 1;
}

export function initialState(
  mode: Mode = 2,
  totalWalls = defaultWallsFor(mode),
  totalRounds = 5,
): GameState {
  return {
    mode,
    pawns: startsFor(mode),
    active: Array.from({ length: mode }, () => true),
    wallsLeft: Array.from({ length: mode }, () => totalWalls),
    walls: [],
    lastWall: null,
    turn: 0,
    winner: null,
    totalWalls,
    score: Array.from({ length: mode }, () => 0),
    totalRounds,
    matchWinner: null,
  };
}

export function newRound(state: GameState, starter: PlayerId): GameState {
  return {
    ...state,
    pawns: startsFor(state.mode),
    active: Array.from({ length: state.mode }, () => true),
    wallsLeft: Array.from({ length: state.mode }, () => state.totalWalls),
    walls: [],
    lastWall: null,
    turn: starter,
    winner: null,
  };
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < BOARD && c >= 0 && c < BOARD;
}

// Is a direct step from (r,c) → (r2,c2) blocked by any wall? Assumes adjacent.
export function isBlocked(
  r: number,
  c: number,
  r2: number,
  c2: number,
  walls: Wall[],
): boolean {
  const dr = r2 - r;
  const dc = c2 - c;
  for (const w of walls) {
    if (dr === 0 && dc === 1) {
      if (w.o === "v" && w.c === c && (w.r === r || w.r === r - 1)) return true;
    } else if (dr === 0 && dc === -1) {
      if (w.o === "v" && w.c === c - 1 && (w.r === r || w.r === r - 1)) return true;
    } else if (dr === 1 && dc === 0) {
      if (w.o === "h" && w.r === r && (w.c === c || w.c === c - 1)) return true;
    } else if (dr === -1 && dc === 0) {
      if (w.o === "h" && w.r === r - 1 && (w.c === c || w.c === c - 1)) return true;
    }
  }
  return false;
}

// Legal one-step pawn moves. Pawns block each other (no jumping in this variant).
export function legalPawnMoves(state: GameState, player: PlayerId): Pos[] {
  if (!state.active[player]) return [];
  const [r, c] = state.pawns[player];
  const dirs: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const results: Pos[] = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (isBlocked(r, c, nr, nc, state.walls)) continue;
    let occupied = false;
    for (let i = 0; i < state.mode; i++) {
      if (i === player || !state.active[i]) continue;
      if (state.pawns[i][0] === nr && state.pawns[i][1] === nc) {
        occupied = true;
        break;
      }
    }
    if (occupied) continue;
    results.push([nr, nc]);
  }
  return results;
}

export function reachedGoal(pos: Pos, goal: Goal): boolean {
  return goal.kind === "row" ? pos[0] === goal.value : pos[1] === goal.value;
}

// BFS from `from` to any cell matching `goal` (a row or column edge).
function hasPathToGoal(from: Pos, goal: Goal, walls: Wall[]): boolean {
  if (reachedGoal(from, goal)) return true;
  const seen = new Set<string>();
  const q: Pos[] = [from];
  seen.add(`${from[0]},${from[1]}`);
  const dirs: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  while (q.length) {
    const [r, c] = q.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
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

export function canPlaceWall(
  state: GameState,
  player: PlayerId,
  w: WallSpec,
): boolean {
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

export function applyMove(
  state: GameState,
  player: PlayerId,
  move: Move,
): GameState | null {
  if (state.winner !== null) return null;
  if (state.turn !== player) return null;
  if (!state.active[player]) return null;

  if (move.kind === "pawn") {
    const legal = legalPawnMoves(state, player);
    if (!legal.some(([a, b]) => a === move.to[0] && b === move.to[1])) return null;
    const pawns = state.pawns.map((p, i) =>
      i === player ? ([move.to[0], move.to[1]] as Pos) : p,
    );
    const goals = goalsFor(state.mode);
    const active = [...state.active];
    let winner: PlayerId | null = null;
    if (reachedGoal(move.to, goals[player])) {
      // First to reach their goal wins the round immediately.
      winner = player;
      active[player] = false;
    }
    let score = state.score;
    let matchWinner = state.matchWinner;
    if (winner !== null) {
      score = [...state.score];
      score[winner] += 1;
      if (score[winner] >= winsNeeded(state.totalRounds)) matchWinner = winner;
    }
    return {
      ...state,
      pawns,
      active,
      turn: winner !== null ? player : nextTurn(state.mode, active, player),
      winner,
      score,
      matchWinner,
    };
  } else {
    if (!canPlaceWall(state, player, move.wall)) return null;
    const placed: Wall = { ...move.wall, by: player };
    const wallsLeft = [...state.wallsLeft];
    wallsLeft[player] -= 1;
    return {
      ...state,
      walls: [...state.walls, placed],
      wallsLeft,
      lastWall: placed,
      turn: nextTurn(state.mode, state.active, player),
    };
  }
}

// Award the round to the last remaining player when someone forfeits.
// 2p: forfeit always ends the round. 4p: game continues if 2+ active.
export function applyForfeit(state: GameState, player: PlayerId): GameState | null {
  if (state.winner !== null || state.matchWinner !== null) return null;
  if (!state.active[player]) return null;
  const active = [...state.active];
  active[player] = false;
  const remaining = active
    .map((v, i) => (v ? (i as PlayerId) : -1))
    .filter((i): i is PlayerId => i >= 0);
  let winner: PlayerId | null = state.winner;
  let score = state.score;
  let matchWinner: PlayerId | null = state.matchWinner;
  let turn = state.turn;
  if (remaining.length === 1) {
    winner = remaining[0];
    score = [...state.score];
    score[winner] += 1;
    if (score[winner] >= winsNeeded(state.totalRounds)) matchWinner = winner;
    turn = winner;
  } else if (remaining.length >= 2) {
    turn = nextTurn(state.mode, active, player);
  }
  return { ...state, active, winner, score, matchWinner, turn };
}