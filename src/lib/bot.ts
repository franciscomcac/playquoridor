// Local Quoridor AI opponent. Pure functions — no UI or I/O.
// Difficulty is a number in [0..1]. Higher = deeper lookahead, tighter
// pruning of blunders, aggressive trap-blocking when the opponent is
// close to their goal.
import {
  BOARD, canPlaceWall, goalsFor, isBlocked, legalPawnMoves, reachedGoal,
  type GameState, type Goal, type Move, type Orient, type PlayerId,
  type Pos, type Wall,
} from "./quoridor";
import { pickTitaniumMove } from "./bot-titanium";

export type BotDifficulty = { label: "Medium" | "Hard"; value: number };

// ---------- Ranked bots ----------
// The DB holds 100 bot player rows. Each has a locked `initial_rating`
// (drives play strength) and a `current_rating` that drifts like a human's
// after every ranked match. Matchmaking picks the bot whose CURRENT rating
// is closest to the caller's, with light jitter server-side. Difficulty
// is derived from the bot's INITIAL rating so its play strength never
// changes even as its ELO drifts.
import { supabase } from "@/integrations/supabase/client";

export type RankedBot = {
  playerId: string;
  name: string;
  /** Locked at creation — drives play strength forever. */
  initialRating: number;
  /** Drifts with wins/losses; used for matchmaking proximity only. */
  currentRating: number;
  /** Difficulty derived from initialRating (0..1). */
  difficulty: number;
};

/** Piecewise mapping of a locked initial rating to bot difficulty (0..1). */
export function difficultyForRating(rating: number): number {
  const points: Array<[number, number]> = [
    // Old top (0.98) is now mid-strong; Titanium takes the crown at 1.0.
    [400, 0.28], [700, 0.42], [1000, 0.55],
    [1300, 0.72], [1600, 0.85], [1800, 0.94], [2000, 1.00],
  ];
  if (rating <= points[0][0]) return points[0][1];
  if (rating >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [r1, d1] = points[i];
    const [r2, d2] = points[i + 1];
    if (rating >= r1 && rating <= r2) {
      const t = (rating - r1) / (r2 - r1);
      return d1 + (d2 - d1) * t;
    }
  }
  return 0.6;
}

/** Pick a ranked bot near the caller's rating via the server. */
export async function pickRankedBotForRating(rating: number): Promise<RankedBot | null> {
  const { data, error } = await supabase.rpc("pick_ranked_bot", { _rating: Math.round(rating) });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { player_id: string; name: string; initial_rating: number; current_rating: number };
  return {
    playerId: row.player_id,
    name: row.name,
    initialRating: row.initial_rating,
    currentRating: row.current_rating,
    difficulty: difficultyForRating(row.initial_rating),
  };
}

export function randomDifficulty(): BotDifficulty {
  const r = Math.random();
  // Fluctuate each game between medium and hard — no easy bots.
  if (r < 0.55) return { label: "Medium", value: 0.55 + Math.random() * 0.15 };
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

// ---------- Move picker ----------

// Best pawn-step distance the given slot can achieve in one legal move
// under a hypothetical wall set. Uses legalPawnMoves via a synthetic
// state that swaps in the modified walls.
function bestPawnStepDist(state: GameState, walls: Wall[], slot: PlayerId, goal: Goal): number {
  const synth: GameState = { ...state, walls, turn: slot };
  const from = state.pawns[slot];
  let best = bfsDist(from, goal, walls);
  for (const to of legalPawnMoves(synth, slot)) {
    const d = bfsDist(to, goal, walls);
    if (d < best) best = d;
  }
  return best;
}

export function pickBotMove(state: GameState, bot: PlayerId, difficulty: number): Move | null {
  if (state.winner !== null || state.matchWinner !== null) return null;
  if (!state.active[bot]) return null;

  // Titanium engine tier — 2p only, top strength. Falls through on failure.
  if (difficulty >= 0.95 && state.mode === 2) {
    try {
      const budget = difficulty >= 0.99 ? 550 : 400;
      const depth = difficulty >= 0.99 ? 5 : 4;
      const t = pickTitaniumMove(state, bot, { budgetMs: budget, maxDepth: depth, wallBudget: 14 });
      if (t) return t;
    } catch { /* fall through to classic engine */ }
  }

  const legal = legalPawnMoves(state, bot);
  if (legal.length === 0) return null;

  const goals = goalsFor(state.mode);
  const myGoal = goals[bot];

  // ----- Opponent set & baseline distances -----
  const opps: PlayerId[] = [];
  for (let i = 0; i < state.mode; i++) {
    if (i !== bot && state.active[i]) opps.push(i as PlayerId);
  }

  const myDNow = bfsDist(state.pawns[bot], myGoal, state.walls);
  const oppDNow = opps.map((o) => bfsDist(state.pawns[o], goals[o], state.walls));
  const oppMinD = opps.length ? Math.min(...oppDNow) : Infinity;
  const closestOppIdx = oppDNow.indexOf(oppMinD);

  // Panic mode: opponent is dangerously close and ahead. Must consider
  // blocking walls even at a cost.
  const critical = oppMinD <= 3 && myDNow >= oppMinD;
  const nearCritical = oppMinD <= 4 && myDNow >= oppMinD;

  // ----- Rank pawn moves -----
  const scored = legal
    .map((to) => ({ to, d: bfsDist(to, myGoal, state.walls) }))
    .sort((a, b) => a.d - b.d);
  const bestPawnD = scored[0].d;
  const bestGroup = scored.filter((s) => s.d === bestPawnD);
  const nearBest = scored.filter((s) => s.d <= bestPawnD + 1);
  const subOptChance = Math.max(0, 0.28 - difficulty * 0.24);
  const pickPawn = (): Move => {
    // Instant win — always take it.
    if (bestPawnD === 0) {
      return { kind: "pawn", to: bestGroup[Math.floor(Math.random() * bestGroup.length)].to };
    }
    if (nearBest.length > bestGroup.length && Math.random() < subOptChance) {
      const alt = nearBest[Math.floor(Math.random() * nearBest.length)];
      return { kind: "pawn", to: alt.to };
    }
    return { kind: "pawn", to: bestGroup[Math.floor(Math.random() * bestGroup.length)].to };
  };

  // If we can step onto the goal this turn, just do it.
  if (bestPawnD === 0) return pickPawn();

  // ----- Should we even look at walls this turn? -----
  // Base propensity climbs with difficulty; panic mode always considers walls.
  const wallChance = critical ? 1 : (0.18 + difficulty * 0.55);
  const considerWalls =
    state.wallsLeft[bot] > 0 && opps.length > 0 && (critical || Math.random() < wallChance);

  if (!considerWalls) return pickPawn();

  // ----- Prune wall candidates near any pawn or existing wall -----
  const pawnPositions: Pos[] = [];
  for (let i = 0; i < state.mode; i++) if (state.active[i]) pawnPositions.push(state.pawns[i]);
  const nearestPawn = (r: number, c: number): number => {
    let m = Infinity;
    for (const [pr, pc] of pawnPositions) {
      const d = Math.abs(pr - r) + Math.abs(pc - c);
      if (d < m) m = d;
    }
    return m;
  };
  const nearestWall = (r: number, c: number): number => {
    if (state.walls.length === 0) return Infinity;
    let m = Infinity;
    for (const w of state.walls) {
      const d = Math.abs(w.r - r) + Math.abs(w.c - c);
      if (d < m) m = d;
    }
    return m;
  };
  const searchRadius = critical ? 8 : nearCritical ? 6 : 4;

  const orients: Orient[] = ["h", "v"];
  type WallCand = { w: { r: number; c: number; o: Orient }; score: number; oppDelta: number; myDelta: number };
  const cands: WallCand[] = [];

  for (let r = 0; r < BOARD - 1; r++) {
    for (let c = 0; c < BOARD - 1; c++) {
      if (nearestPawn(r, c) > searchRadius && nearestWall(r, c) > 2) continue;
      for (const o of orients) {
        const w = { r, c, o };
        if (!canPlaceWall(state, bot, w)) continue;
        const walls2: Wall[] = [...state.walls, { r, c, o, by: bot }];

        // My cost: don't blunder into walls that slow me down (unless critical).
        const myD2 = bfsDist(state.pawns[bot], myGoal, walls2);
        const myDelta = myD2 - myDNow; // >= 0
        if (!critical && myDelta > 0) continue;

        // Opponent cost: look at each opp's dist AFTER their best pawn reply
        // to the new wall set. That catches "detour" walls where the raw
        // BFS gain is small but the opponent still has to walk around.
        let totalOppDelta = 0;
        let closestOppDelta = 0;
        for (let i = 0; i < opps.length; i++) {
          const oppD2 = bfsDist(state.pawns[opps[i]], goals[opps[i]], walls2);
          const raw = oppD2 - oppDNow[i];

          // Approx 1-ply reply: what dist can they reach after one step?
          // Positive "block" bonus if the wall actually costs them a normal
          // walking step compared to no-wall (they'd normally go to oppDNow-1).
          const afterStep = bestPawnStepDist(state, walls2, opps[i], goals[opps[i]]);
          const normalStep = Math.max(0, oppDNow[i] - 1);
          const stepBlocked = Math.max(0, afterStep - normalStep);

          const contribution = raw + stepBlocked * 0.75;
          totalOppDelta += contribution;
          if (i === closestOppIdx) closestOppDelta = contribution;
        }

        // Net race delta: how much closer to winning we get by playing this
        // wall instead of a pawn move. A pawn move nets -1 for our dist, so
        // a wall beats a pawn iff (oppDelta - myDelta) >= 1 in the 1v1 case.
        let score = totalOppDelta - myDelta;

        // Extra credit for hitting the closest opponent specifically — they're
        // the racing threat, not the far-away 4p bystander.
        score += Math.max(0, closestOppDelta) * 0.25;

        // Panic bonus: any wall that adds real steps to the near-goal opponent
        // is worth playing even if it costs us a little.
        if (critical) score += closestOppDelta * 1.5 - myDelta * 0.5;

        cands.push({ w, score, oppDelta: totalOppDelta, myDelta });
      }
    }
  }

  if (cands.length === 0) return pickPawn();

  cands.sort((a, b) => b.score - a.score);

  // ----- Optional 2-ply refinement for the top few candidates -----
  // For each of the top walls, simulate the opponent's best pawn step and
  // re-evaluate the race lead. Highest-remaining lead wins. This is what
  // catches "you're one move from a forced detour" setups.
  if (difficulty >= 0.7 && opps.length === 1) {
    const opp = opps[0];
    const oppGoal = goals[opp];
    const topN = difficulty >= 0.9 ? 8 : 5;
    const rescored: WallCand[] = [];
    for (const cand of cands.slice(0, topN)) {
      const walls2: Wall[] = [...state.walls, { r: cand.w.r, c: cand.w.c, o: cand.w.o, by: bot }];
      const myD2 = bfsDist(state.pawns[bot], myGoal, walls2);

      // Opp plays their best pawn step.
      const synth: GameState = { ...state, walls: walls2, turn: opp };
      const oppMoves = legalPawnMoves(synth, opp);
      let oppBestPos: Pos = state.pawns[opp];
      let oppBestD = bfsDist(state.pawns[opp], oppGoal, walls2);
      for (const to of oppMoves) {
        const d = bfsDist(to, oppGoal, walls2);
        if (d < oppBestD) { oppBestD = d; oppBestPos = to; }
      }

      // Now our best pawn reply from myD2 → (myD2 - 1) usually.
      const synth2: GameState = {
        ...state,
        walls: walls2,
        pawns: state.pawns.map((p, i) => (i === opp ? oppBestPos : p)) as GameState["pawns"],
        turn: bot,
      };
      const myMoves = legalPawnMoves(synth2, bot);
      let myBestD = myD2;
      for (const to of myMoves) {
        const d = bfsDist(to, myGoal, walls2);
        if (d < myBestD) myBestD = d;
      }

      // Race lead after both replies. Higher = better for us.
      const lead = oppBestD - myBestD;
      rescored.push({ ...cand, score: lead + (critical ? 2 : 0) });
    }
    rescored.sort((a, b) => b.score - a.score);
    cands.splice(0, topN, ...rescored);
  }

  const best = cands[0];

  // Threshold to spend a wall vs. just walking. Higher = more conservative.
  // Race lead reference: if we're already winning the race, don't waste walls.
  const raceLead = oppMinD - myDNow; // >0 = we're ahead
  let threshold = difficulty < 0.4 ? 2.2 : difficulty < 0.7 ? 1.5 : 1.0;
  if (raceLead >= 4) threshold += 1.5;      // way ahead — keep walls in bank
  else if (raceLead >= 2) threshold += 0.5;
  if (critical) threshold = -Infinity;       // must block

  // Also: on high difficulty, if the current best wall is a clean +2 or
  // better, take it even if the random propensity would've said skip.
  if (best.score >= threshold) {
    return { kind: "wall", wall: best.w };
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
