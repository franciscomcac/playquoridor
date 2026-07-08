// Accumulates a full match's move history across rounds so we can export a
// GIF, replay for review, and drive engine analysis. The live GameState only
// carries the current round's moves — this module snapshots each completed
// round as it happens.
import { useEffect, useRef } from "react";
import type { GameState, Mode, MoveRecord, PlayerId } from "@/lib/quoridor";

export type RoundSnap = {
  startingSlot: PlayerId;
  moves: MoveRecord[];
  winner: PlayerId | null;
};

export type MatchSnapshot = {
  version: 2;
  mode: Mode;
  totalWalls: number;
  totalRounds: number;
  playerNames: string[];
  rounds: RoundSnap[];
  matchWinner: PlayerId | null;
  score: number[];
  createdAt: string;
};

export function useMatchHistory(state: GameState, playerNames: string[]) {
  const roundsRef = useRef<RoundSnap[]>([]);
  const currentStartRef = useRef<PlayerId | null>(null);
  const prevWinnerRef = useRef<PlayerId | null>(null);
  const prevMatchIdRef = useRef<number>(0);

  useEffect(() => {
    // Detect a fresh match — matchWinner cleared and score all-zero and no
    // moves yet — and reset the accumulator.
    const scoreSum = state.score.reduce((a, b) => a + b, 0);
    if (
      state.matchWinner === null &&
      scoreSum === 0 &&
      (state.moves?.length ?? 0) === 0 &&
      roundsRef.current.length > 0
    ) {
      roundsRef.current = [];
      currentStartRef.current = state.turn;
      prevWinnerRef.current = null;
      prevMatchIdRef.current += 1;
    }
    // Capture the starter for the current round at the moment the moves
    // buffer is empty.
    if ((state.moves?.length ?? 0) === 0 && state.winner === null) {
      currentStartRef.current = state.turn;
    }
    // Round just ended → snapshot it.
    if (prevWinnerRef.current === null && state.winner !== null) {
      roundsRef.current.push({
        startingSlot: currentStartRef.current ?? state.turn,
        moves: [...(state.moves ?? [])],
        winner: state.winner,
      });
    }
    prevWinnerRef.current = state.winner;
  }, [state]);

  return {
    getSnapshot(): MatchSnapshot {
      // Merge in the current round if it isn't finished yet (defensive — the
      // export button lives on the match-end screen, but keep this correct).
      const rounds = [...roundsRef.current];
      if (state.winner === null && (state.moves?.length ?? 0) > 0) {
        rounds.push({
          startingSlot: currentStartRef.current ?? state.turn,
          moves: [...(state.moves ?? [])],
          winner: null,
        });
      }
      return {
        version: 2,
        mode: state.mode,
        totalWalls: state.totalWalls,
        totalRounds: state.totalRounds,
        playerNames: playerNames.slice(0, state.mode),
        rounds,
        matchWinner: state.matchWinner,
        score: [...state.score],
        createdAt: new Date().toISOString(),
      };
    },
  };
}

export function isMatchSnapshot(x: unknown): x is MatchSnapshot {
  return !!x && typeof x === "object" && (x as { version?: number }).version === 2
    && Array.isArray((x as MatchSnapshot).rounds);
}