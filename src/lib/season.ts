// Beta season starts 2026-07-08 UTC. Each subsequent season is 60 days.
// Beta -> Season 1 -> Season 2 ...
const SEASON_START = Date.UTC(2026, 6, 8); // July 8, 2026
const SEASON_LENGTH_MS = 60 * 24 * 60 * 60 * 1000;

export type SeasonInfo = {
  label: string; // "Beta Season" | "Season 1" | ...
  short: string; // "Beta" | "S1" | ...
  index: number; // 0 = Beta, 1 = Season 1, ...
  endsAt: Date;
  daysLeft: number;
  endsLabel: string; // "Ends in 60 days" | "Ends today" | "Ends tomorrow"
};

export function currentSeason(now: Date = new Date()): SeasonInfo {
  const t = now.getTime();
  const elapsed = Math.max(0, t - SEASON_START);
  const index = Math.floor(elapsed / SEASON_LENGTH_MS);
  const endsAt = new Date(SEASON_START + (index + 1) * SEASON_LENGTH_MS);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - t) / (24 * 60 * 60 * 1000)));
  const label = index === 0 ? "Beta Season" : `Season ${index}`;
  const short = index === 0 ? "Beta" : `S${index}`;
  const endsLabel =
    daysLeft === 0 ? "Ends today" : daysLeft === 1 ? "Ends tomorrow" : `Ends in ${daysLeft} days`;
  return { label, short, index, endsAt, daysLeft, endsLabel };
}
