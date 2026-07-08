# Plan

Ship this in one pass. Five pieces.

## 1. Signup / onboarding flow (animated, interactive)

After a user creates an account (email or Google), route them through a 2-step onboarding overlay before landing on `/`:

**Step 1 — Pick a permanent username**
- Text input, 3–16 chars, `[a-z0-9_]` only, lowercased.
- Live availability check against `players.name` (debounced, 300ms). Server function `checkUsernameAvailable(name)` runs a case-insensitive `players` lookup.
- Green check / red X animates in as you type.

**Step 2 — Pick your country**
- Typeahead search over an ISO country list. Arrow keys + enter.
- Static SVG world map on the right (embed a lightweight world outline). When you pick a country, a glowing pin animates from center to that country's lat/lng with a spring; the country outline pulses briefly.
- Uses a small local dataset (`src/lib/countries.ts` — name, ISO2, lat, lng, flag emoji) and a single-file world SVG so no heavy map library.

Both steps use framer-motion for entrance/exit and the pin animation.
Confirming calls the existing `complete_onboarding(_player_id, _name, _country)` RPC.

## 2. Username permanence

- `players.name` currently isn't unique. Migration: add `citext`-style unique index on `lower(name)`; harden `complete_onboarding` to reject a taken name.
- Once onboarded (`onboarded_at IS NOT NULL`), remove the "edit name" affordance from the menu; the name is permanent. Anonymous / guest sessions keep the current random editable temp name.

## 3. Header account menu (replaces Sign in / Sign up when signed in)

Signed-out: keep the current Sign in + green Sign up buttons.

Signed-in: replace both with a single avatar chip (flag + username, dropdown arrow). Dropdown items:
- Profile (`/u/$username`) — public stats page
- Friends (`/friends`)
- Match history (`/history`)
- Saved clips (`/clips`)
- Settings
- Sign out

Uses shadcn `DropdownMenu`, animated open/close.

## 4. New pages (v1 scaffolds, real data where it exists)

- **`/friends`** — search users by username, send/accept friend requests, show online friends.
  New table `public.friendships (requester uuid, addressee uuid, status text, created_at)` with RLS + grants.
- **`/history`** — list of past matches from `matches` + `match_players` for the current user. Each row expands into an "Analysis" panel: score, walls placed, pawns eliminated, avg move time, key moments (round wins). Analysis is derived from stored data — no engine eval this pass.
- **`/clips`** — saved clips list. Adds `public.saved_clips (id, owner uuid, match_id, title, state_snapshot jsonb, created_at)`. In-game we add a "Save clip" button on the round-end overlay that snapshots the final `GameState`. Clip view replays the snapshot on a static board.

All three routes live under `_authenticated/`.

## 5. Chaos banner on 4-player

Small animated banner ("⚡ CHAOS MODE — 4 players, one board") that:
- Shows on the Quick Match 4p button in the lobby (subtle pulse).
- Slides in at the top of the game screen when `state.mode === 4` for the first 3 seconds of a match, then persists as a small `CHAOS` chip in the header.

## Technical

- No new heavy deps. framer-motion is already available if not I'll add it. World map = inline SVG (topojson-lite outline, ~40KB gzipped, committed as `src/assets/world.svg`).
- New tables get GRANTs + RLS in the same migration.
- All new server reads use `createServerFn` + `requireSupabaseAuth`; public username-check uses the server publishable client.
- Chaos banner is pure presentation, no backend.

## Out of scope (say so up front)

- Real-time friend presence beyond "seen in last 5 min".
- Engine-based move quality analysis (blunders/best move) — data model supports adding it later.
- Video clips. "Clips" are replayable game snapshots, not video.

Confirm and I'll build it end to end.
