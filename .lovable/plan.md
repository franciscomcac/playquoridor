# Ranked bot pool: 100 bots with dynamic ELO, fixed strength

## What's broken today

- Only **6 hard-coded bot rows** exist in the DB (ratings 700, 900, 1100, 1300, 1500, 1700). Ranked fallback picks whichever of those 6 is closest to your ELO — so you keep meeting the same handful.
- Bot difficulty currently comes from a hardcoded number attached to each of the 6 tiers, so if a bot's rating drifted from wins/losses there'd be no separation between "who they are" and "how they play."
- No mechanism to pick from a large pool by *current* rating.

## Goal

- **100 unique ranked bots** with gamertag-style names, seeded across the ladder.
- Each bot has an **initial_rating** (locked forever, drives difficulty) and a **current rating** (updates like a human's after every ranked match, via existing `apply_elo_1v1`).
- Ranked matchmaking timeout picks the bot whose **current rating** is closest to yours (with tiny jitter so it isn't always the same one).
- Bots keep playing at the strength implied by their **initial_rating**, no matter how far their current rating drifts.
- Bots stay hidden from the leaderboard.

## Plan

### 1. Database migration

- Add `is_bot boolean not null default false` and `initial_rating int` to `public.players`.
- Backfill the existing 6 bots: `is_bot = true`, `initial_rating = current rating`.
- Seed **94 new bot rows** so total = 100, with:
  - Unique UUIDs, unique gamertag-style names (curated list — no "bot" / "novice" / numeric suffixes look).
  - `initial_rating` spread across 400–2200 (roughly matches the ladder curve, denser around 900–1500 where real players cluster).
  - Matching `player_stats` row with `rating = initial_rating`, `ranked_matches = 0`.
- Add index on `player_stats.rating` for fast nearest-neighbor lookup.
- Update `search_players` to exclude `is_bot = true` so bots don't appear in friend search.

### 2. Server function: pick bot by current rating

New `pickRankedBotForRating` server fn (public, no auth needed — reads bot rows only):
- Query bots ordered by `abs(current_rating − player_rating)`, limit 5.
- Pick one at random from those 5 (so the same rating band doesn't always yield the same bot).
- Return `{ playerId, name, initialRating, currentRating }`.

### 3. Client wiring

- Replace the hardcoded `RANKED_BOTS` array in `src/lib/bot.ts` with:
  - A `difficultyForRating(rating)` helper that maps `initial_rating` → difficulty value (piecewise: 400→0.30, 700→0.45, 1000→0.60, 1300→0.78, 1600→0.90, 2000+→0.98).
  - Keep `RankedBot` type but source it from the server fn.
- In `game.tsx` `onBotFallback`: call `pickRankedBotForRating(myRating)` instead of the local `rankedBotForRating`. Compute difficulty from `bot.initialRating`.

### 4. Leaderboard / stats filtering

- Replace `RANKED_BOT_PLAYER_IDS` static list with a `is_bot = false` filter in:
  - `fetchLeaderboard` (`src/lib/stats.ts`)
  - Anywhere else the constant is used.
- `apply_elo_1v1` updates: switch the "skip counter increment" check from the hardcoded UUID list to a lookup on `players.is_bot`.

### 5. Timing tweak

- The ranked→bot fallback fires after 5s of no opponent. Keep as-is unless you want it faster.

## What stays the same

- ELO math (`apply_elo_1v1`).
- Rank overlays, bot AI engine, wall/pawn animations.
- Bot names are still random gamertags per match display-wise — but now the underlying `player_id` and stored name are one of 100 real DB identities, so match history / rating drift is coherent.

## Open questions

1. **Bot's displayed name in-match**: Keep showing a fresh `randomGamerName()` each match (current behavior), or show the bot's actual stored name (e.g. "phaseShift") so repeat matches feel like recurring rivals? I'd recommend **the actual stored name** now that there are 100 of them — makes ranked feel populated.
2. Any specific rating spread you want (e.g. more bots at 1000–1400 where most players sit), or leave it roughly uniform 400–2200?
