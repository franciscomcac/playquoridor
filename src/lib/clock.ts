// Chess-style per-player countdown clocks. Pure helpers — no timers here,
// callers drive updates on turn transitions and on demand for display.

export type ClockState = {
  remaining: number[];   // ms left per player, decremented only on turn end
  turnStartedAt: number; // wall-clock ms when the current turn began
  total: number;         // starting budget in ms (used for reset)
};

export const DEFAULT_CLOCK_MS = 5 * 60 * 1000;

export function initClocks(mode: number, total = DEFAULT_CLOCK_MS): ClockState {
  return {
    remaining: Array.from({ length: mode }, () => total),
    turnStartedAt: Date.now(),
    total,
  };
}

// Live remaining ms for a given player at time `now`. Only the active
// player's clock is decremented in real time.
export function liveRemaining(clocks: ClockState, activeTurn: number, playerId: number, now: number): number {
  const stored = clocks.remaining[playerId] ?? 0;
  if (playerId !== activeTurn) return Math.max(0, stored);
  return Math.max(0, stored - (now - clocks.turnStartedAt));
}

// Called by host after a turn resolves — freezes the ex-active player's
// remaining time and resets the timestamp for the new active player.
export function endTurn(clocks: ClockState, prevTurn: number, now: number): ClockState {
  const remaining = clocks.remaining.slice();
  const elapsed = now - clocks.turnStartedAt;
  remaining[prevTurn] = Math.max(0, (remaining[prevTurn] ?? 0) - elapsed);
  return { ...clocks, remaining, turnStartedAt: now };
}

// Reset a single player's remaining (used when a player is added back / not
// applicable here) — kept for completeness.
export function resetClocks(mode: number, total = DEFAULT_CLOCK_MS): ClockState {
  return initClocks(mode, total);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
