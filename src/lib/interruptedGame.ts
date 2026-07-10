// Persistent record of the match a player was in when they closed the tab
// so we can offer to resume on next visit. Isolated here (was inline in
// src/routes/game.tsx) so tests and other surfaces can reuse it.
import { defaultWallsFor, type Mode } from "@/lib/quoridor";

export type SavedGame = {
  isHost: boolean;
  code: string;
  mode: Mode;
  walls: number;
  rounds: number;
  quickMatch?: boolean;
  ranked?: boolean;
  savedAt: number;
};

const ACTIVE_GAME_KEY = "quoridor:activeGame";
const ACTIVE_GAME_TTL_MS = 2 * 60 * 60 * 1000;

export function saveInterruptedGame(game: SavedGame) {
  try {
    localStorage.setItem(
      ACTIVE_GAME_KEY,
      JSON.stringify({ ...game, savedAt: Date.now() }),
    );
  } catch { /* ignore */ }
}

export function clearInterruptedGame() {
  try { localStorage.removeItem(ACTIVE_GAME_KEY); } catch { /* ignore */ }
}

export function loadInterruptedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    const code = typeof parsed.code === "string" ? parsed.code.toUpperCase() : "";
    const mode = parsed.mode === 4 ? 4 : parsed.mode === 2 ? 2 : null;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!mode || code.length !== 5 || Date.now() - savedAt > ACTIVE_GAME_TTL_MS) {
      clearInterruptedGame();
      return null;
    }
    return {
      isHost: !!parsed.isHost,
      code,
      mode,
      walls: typeof parsed.walls === "number" ? parsed.walls : defaultWallsFor(mode),
      rounds: typeof parsed.rounds === "number" ? parsed.rounds : 3,
      quickMatch: !!parsed.quickMatch,
      ranked: !!parsed.ranked,
      savedAt,
    };
  } catch {
    clearInterruptedGame();
    return null;
  }
}