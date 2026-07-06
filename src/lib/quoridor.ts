// Quoridor game logic — pure functions. 9x9 board, walls between cells.
// Coordinates: [row, col], row 0 = top. P1 starts bottom (row 8), goal row 0.
// P2 starts top (row 0), goal row 8. Walls at (r,c,orient) with r,c in 0..7.
// Horizontal wall at (r,c) blocks (r,c)<->(r+1,c) and (r,c+1)<->(r+1,c+1).
// Vertical wall at (r,c) blocks (r,c)<->(r,c+1) and (r+1,c)<->(r+1,c+1).

export type Orient = "h" | "v";
export type Wall = { r: number; c: number; o: Orient };
export type Pos = [number, number];

export type GameState = {
  pawns: [Pos, Pos];
  walls: Wall[];
  wallsLeft: [number, number];
  turn: 0 | 1;
  winner: 0 | 1 | null;
  totalWalls: number;
};

export type Move =
  | { kind: "pawn"; to: Pos }
  | { kind: "wall"; wall: Wall };

export const BOARD = 9;

export function initialState(totalWalls = 10): GameState {
  return {
    pawns: [
      [8, 4],
      [0, 4],
    ],
    walls: [],
    wallsLeft: [totalWalls, totalWalls],
    turn: 0,
    winner: null,
    totalWalls,
  };
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < BOARD && c >= 0 && c < BOARD;
}

// Is direct step from (r,c) to (r2,c2) blocked by a wall? Assumes adjacent.
export function isBlocked(r: number, c: number, r2: number, c2: number, walls: Wall[]): boolean {
  const dr = r2 - r;
  const dc = c2 - c;
  for (const w of walls) {
    if (dr === 0 && dc === 1) {
      // moving right
      if (w.o === "v" && w.c === c && (w.r === r || w.r === r - 1)) return true;
    } else if (dr === 0 && dc === -1) {
      // moving left
      if (w.o === "v" && w.c === c - 1 && (w.r === r || w.r === r - 1)) return true;
    } else if (dr === 1 && dc === 0) {
      // moving down
      if (w.o === "h" && w.r === r && (w.c === c || w.c === c - 1)) return true;
    } else if (dr === -1 && dc === 0) {
      // moving up
      if (w.o === "h" && w.r === r - 1 && (w.c === c || w.c === c - 1)) return true;
    }
  }
  return false;
}

export function legalPawnMoves(state: GameState, player: 0 | 1): Pos[] {
  const [r, c] = state.pawns[player];
  const other = state.pawns[1 - player];
  const walls = state.walls;
  const results: Pos[] = [];
  const dirs: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (isBlocked(r, c, nr, nc, walls)) continue;
    if (other[0] === nr && other[1] === nc) {
      // jump straight over if not blocked and in bounds
      const jr = nr + dr;
      const jc = nc + dc;
      const straightOK =
        inBounds(jr, jc) && !isBlocked(nr, nc, jr, jc, walls);
      if (straightOK) {
        results.push([jr, jc]);
      } else {
        // diagonal jumps
        const perps: Array<[number, number]> =
          dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
        for (const [pdr, pdc] of perps) {
          const dr2 = nr + pdr;
          const dc2 = nc + pdc;
          if (!inBounds(dr2, dc2)) continue;
          if (isBlocked(nr, nc, dr2, dc2, walls)) continue;
          results.push([dr2, dc2]);
        }
      }
    } else {
      results.push([nr, nc]);
    }
  }
  // de-dup
  const seen = new Set<string>();
  return results.filter(([a, b]) => {
    const k = `${a},${b}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function hasPathToRow(from: Pos, goalRow: number, walls: Wall[]): boolean {
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
    if (r === goalRow) return true;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      if (isBlocked(r, c, nr, nc, walls)) continue;
      seen.add(k);
      q.push([nr, nc]);
    }
  }
  return false;
}

export function wallConflicts(walls: Wall[], w: Wall): boolean {
  if (w.r < 0 || w.r > BOARD - 2 || w.c < 0 || w.c > BOARD - 2) return true;
  for (const e of walls) {
    if (e.o === w.o && e.r === w.r && e.c === w.c) return true;
    if (w.o === "h" && e.o === "h" && e.r === w.r && Math.abs(e.c - w.c) === 1) return true;
    if (w.o === "v" && e.o === "v" && e.c === w.c && Math.abs(e.r - w.r) === 1) return true;
    if (w.o !== e.o && e.r === w.r && e.c === w.c) return true;
  }
  return false;
}

export function canPlaceWall(state: GameState, player: 0 | 1, w: Wall): boolean {
  if (state.winner !== null) return false;
  if (state.wallsLeft[player] <= 0) return false;
  if (wallConflicts(state.walls, w)) return false;
  const next = [...state.walls, w];
  if (!hasPathToRow(state.pawns[0], 0, next)) return false;
  if (!hasPathToRow(state.pawns[1], BOARD - 1, next)) return false;
  return true;
}

export function applyMove(state: GameState, player: 0 | 1, move: Move): GameState | null {
  if (state.winner !== null) return null;
  if (state.turn !== player) return null;
  if (move.kind === "pawn") {
    const legal = legalPawnMoves(state, player);
    if (!legal.some(([a, b]) => a === move.to[0] && b === move.to[1])) return null;
    const pawns: [Pos, Pos] = [...state.pawns] as [Pos, Pos];
    pawns[player] = move.to;
    const goal = player === 0 ? 0 : BOARD - 1;
    const winner = move.to[0] === goal ? player : null;
    return {
      ...state,
      pawns,
      turn: (1 - player) as 0 | 1,
      winner,
    };
  } else {
    if (!canPlaceWall(state, player, move.wall)) return null;
    const wallsLeft: [number, number] = [...state.wallsLeft] as [number, number];
    wallsLeft[player] -= 1;
    return {
      ...state,
      walls: [...state.walls, move.wall],
      wallsLeft,
      turn: (1 - player) as 0 | 1,
    };
  }
}