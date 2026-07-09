## What we're building

Four connected changes to the game screen and badge system.

### 1. Badge levels (auto-merge tiered families)

Group same-family badges (e.g. `win_10`/`win_50`/`win_100`/`win_500`/`win_1000` → **Wins**) into one card that shows a level (1–5) and a bar of progress toward the next level. Data stays exactly as it is in the DB; this is a display transform.

**Families**: wins, streaks, walls, milestones (matches), mode_2p, mode_4p, rank, puzzles, friends (link), conduct, rounds, laurel, banner (identity), mode_3p. Non-family badges (e.g. minimalist, phoenix, comeback, void) remain single-level cards.

- New `src/lib/achievement-families.ts` maps slug → `{ familyId, level }` and produces a `getFamilyView(unlockedSlugs, allSlugs)` helper returning `{ familyId, currentLevel, maxLevel, current, next, tier, sigilKey }`.
- `src/routes/achievements.tsx` and `src/routes/profile.tsx` render one card per family, with a level pip strip and "Lv N" label. Non-family slugs render as before.
- `AchievementUnlockOverlay` shows `Level N — Wins` under the badge name when the unlocked slug belongs to a family; overlay ordering coalesces multiple family unlocks in the same match into one reveal at the highest level.

### 2. In-game player banners (top + bottom of board)

New `PlayerBanner` component placed above and below the board. Contents:

```text
[avatar disc #N]  Name           Wall counter (10 vertical bars)
                  PT · 1247 ELO
                  [sigil][sigil][sigil]  ← up to 3 showcased badges
```

- Bottom banner = you. Top banner = opponent (or a horizontal row of banners in 4P mode).
- Country renders as an ISO code chip with a small flag glyph (`countryCode → emoji flag` helper).
- Showcased sigils are the small `ConstellationSigil` at ~28px, pulled from `players.showcased_achievements`.
- Wall counter reuses the existing dot/bar row already shown on the small "YOU/P2" chip.

**Data plumbing (peer protocol extension, backward-compatible):**

- Extend `RosterEntry` and the join/roster peer messages with optional `country`, `rating`, `showcased` (string[] of slugs).
- On host boot and guest join, fetch the local player's `country`, `player_stats.rating`, and `players.showcased_achievements` (single query, or bundled in an existing stats call) and include it in the payload.
- For bot matches, read `players.country`/`player_stats.rating` for the bot row (already exists) and pass `showcased: []`.
- Old clients that don't send these fields fall back to name/ELO-only rendering — no breakage.

### 3. Remove the small YOU / P2 chip strip

Delete the chip row below the board (its two jobs — showing whose turn / wall count — now live in the banners). Retain only the compact clock badge if there is one for the current player.

### 4. Enlarge the opening-animation banners + their badges

The 2P coinflip intro and 4P multi-banner intro currently render small nameplates.

- Increase intro banner width/height ~1.4× and font sizes ~1.25×.
- The pfp/sigil on those banners scales from ~48px → ~72px so the sigil art is legible.
- `introDurationMs` unchanged; only sizing changes.

## Technical details

**Files touched**
- `src/lib/achievement-families.ts` (new)
- `src/lib/peer-room.ts` (roster/join types + payloads)
- `src/lib/stats.ts` (add helper: `fetchPlayerBannerData(playerId)` returning `{country, rating, showcased}`)
- `src/components/PlayerBanner.tsx` (new)
- `src/components/AchievementUnlockOverlay.tsx` (level label)
- `src/components/ConstellationSigil.tsx` (accept optional `level` badge overlay in the corner)
- `src/routes/achievements.tsx`, `src/routes/profile.tsx` (family cards)
- `src/routes/game.tsx` (mount banners above/below board, drop the chip strip, resize intro banners)

**No DB migration required.** All state already exists (`players.country`, `players.showcased_achievements`, `player_stats.rating`, `player_achievements`). Family mapping is client-side. Old peer clients still connect.

## Out of scope

- Changing which slugs the DB grants (no changes to `evaluate_match_achievements`).
- Reworking the showcase picker UI in profile — already exists per `set_showcased_achievements` RPC.
- Adding new badge slugs.
