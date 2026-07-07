
# Quoridor Parlour — Full Upgrade (one pass)

Networking stays PeerJS. Supabase is added only for persistent stats + leaderboard + win counter. Ball-pop FX is repurposed as pawn-elimination FX. Shipping all 7 core areas in one commit as requested.

## 1. Player identity

- Prompt for display name on first visit; validate 2–16 chars, trimmed, non-empty.
- Persist in `localStorage` (`quoridor.playerName`, `quoridor.playerId`). `playerId` is a stable UUID minted once per device — used as the Supabase stats key.
- Editable from a "You are: <name> [edit]" chip on the main menu.
- Names shown everywhere: lobby list, top turn bar, wall counters, coin-flip overlay, end screen, forfeit log.
- Uniqueness per room: host appends " 2", " 3", … on collision when a guest joins.

## 2. Matchmaking

- New "Quick Match" button on the main menu with a 2p/4p toggle.
- Since we're staying on PeerJS (no server registry), Quick Match uses a tiny Supabase table `open_rooms(code, mode, host_name, seats_taken, seats_total, created_at)` as a lobby index. Host inserts on room create, updates `seats_taken` on presence changes, deletes on full/close.
- Quick Match flow: query `open_rooms where mode=X and seats_taken<seats_total order by created_at`, join the oldest; if none, create one.
- "Searching for players… 2/4" state with a Cancel button.
- Auto-start when full; host "Start now" button when partial.
- Manual room-code entry preserved unchanged.

## 3. Leaver handling (existing PeerJS presence)

- Already have peer close events. Wire them to:
  - Mark slot inactive for the rest of the match (not just the round).
  - Log "<Name> left the game" to a new event log panel.
  - Grey out their slot in HUD + coin-flip.
  - If only one active player remains → auto match-win to them, jump to end screen.
- Persist "left this match" set so `newRound` doesn't reactivate them.

## 4. AFK detection

- Track `lastInputAt` per player on the host (authoritative).
- 60s idle → broadcast `{afk: playerId, deadline: now+90s}` → all clients show countdown banner "<Name> is AFK — forfeiting in 1:30".
- Any move/wall/UI click during countdown → broadcast `afk_cancel`, reset timer.
- Countdown expires → host applies forfeit (reuses existing `applyForfeit`), same treatment as leaver.

## 5. Animations

- Pawn elimination pop: scale 1→1.4→0 + radial particle burst (8 shards in player color) + brief white flash. CSS keyframes + absolutely-positioned particle spans; <300ms; fire-and-forget so game state never waits.
- Wall placement: replace instant paint with slide-from-perpendicular + settle bounce (cubic-bezier overshoot) + small dust puff at each end. Existing "latest wall" glow kept.
- All cosmetic — game logic fires immediately, visuals follow via a small `useEffect` on `state.walls.length` / `state.active` diffs.

## 6. Sound

- Web Audio API tones (no asset licensing): pop (descending sine), wall place (thud: low sine + noise burst), join (rising two-tone), match start (triad), round win (arpeggio up), match win (longer arpeggio + sparkle), AFK warn (pulse beep), UI click (short blip).
- `useSound()` hook lazy-inits `AudioContext` on first gesture.
- Settings drawer: mute toggle + master volume slider, persisted in `localStorage`.

## 7. Stats + leaderboard (Supabase)

Tables (all with RLS + explicit GRANTs):

```text
players(id uuid pk, name text, created_at)          -- upsert on name change
player_stats(player_id uuid pk fk→players,
             matches int, wins int, losses int,
             pawns_eliminated int, walls_placed int, forfeits int,
             updated_at)
matches(id uuid pk, mode int2, rounds int2, winner_player_id uuid, ended_at)
match_players(match_id uuid, player_id uuid, slot int2, result text, pk(match_id,slot))
open_rooms(code text pk, mode int2, host_name text, seats_taken int, seats_total int, created_at)
```

- RLS: `players`, `player_stats`, `matches`, `match_players`, `open_rooms` all `SELECT` public. Writes: `INSERT/UPDATE` allowed to `anon` on `open_rooms` + own `players` row (validated by `player_id` matching client-supplied uuid — soft-trust model, matching the game's zero-account nature). Stats writes are anon too; this game has no accounts so server-authoritative scoring is out of scope for this pass.
- End-of-match summary screen: winner banner, final score grid, per-player stats delta (rounds won, walls placed, pawns eliminated, forfeits).
- Stats page (`/stats`) with a leaderboard (top 20 by wins) + a "Find me" lookup by name.
- Persistent win counter chip on main menu tied to `playerId`.

## Technical notes

- New files: `src/lib/identity.ts`, `src/lib/sound.ts`, `src/lib/stats.ts`, `src/lib/afk.ts`, `src/components/EventLog.tsx`, `src/components/EndScreen.tsx`, `src/components/SettingsDrawer.tsx`, `src/components/PawnPopFX.tsx`, `src/routes/stats.tsx`.
- Edits: `src/lib/quoridor.ts` (leaver-persistence, elimination hooks), `src/lib/peer-room.ts` (name in `assign`/`presence`, afk + leaver + log messages), `src/components/QuoridorBoard.tsx` (wall placement animation, elimination FX mount), `src/routes/index.tsx` (Quick Match, name prompt, settings, end screen, integrations).
- Cloud enabled via `supabase--enable`, one migration for the 5 tables + policies + grants, one migration to seed nothing.
- Touch handling on the board already works via pointer events; verified mobile after wall-anim change.

## Explicit non-goals for this pass

- No account system, no ELO, no anti-cheat/server-authoritative scoring, no power-ups, no emotes, no spectator, no reconnect grace, no avatars, no tutorial overlay, no share-card image, no dailies. These are the "Extra upgrade ideas" — separate pass.

## Risk / caveats

- Anon writes to stats are trivially forgeable. Acceptable for a casual P2P party game; call out in end-screen tooltip. Real anti-cheat needs accounts.
- Quick Match lobby index can go stale if a host crashes without cleanup. Mitigation: `created_at` filter drops rooms older than 15min from Quick Match query, and a "stale?" ping before joining.
- PeerJS uses the public cloud broker — no changes there.

Approve to proceed and I'll ship the whole thing.
