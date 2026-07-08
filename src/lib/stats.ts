// Supabase reads/writes for stats, leaderboard, and Quick Match lobby index.
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthSession, getStoredIdentity } from "@/lib/identity";

export type MatchResult = {
  mode: 2 | 4;
  rounds: number;
  ranked?: boolean;
  winnerId: string | null;
  snapshot?: unknown;
  players: Array<{
    id: string | null;
    slot: number;
    name: string;
    roundsWon: number;
    wallsPlaced: number;
    pawnsEliminated: number;
    forfeited: boolean;
  }>;
};

export type LeaderRow = {
  id: string;
  name: string;
  rating: number;
  wins: number;
  matches: number;
  losses: number;
  walls_placed: number;
  pawns_eliminated: number;
};

export async function recordMatch(m: MatchResult): Promise<string | null> {
  try {
    const uid = await ensureAuthSession();
    const myLocalId = getStoredIdentity()?.id ?? null;
    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        mode: m.mode, rounds: m.rounds,
        winner_player_id: m.winnerId, ranked: !!m.ranked,
        ...(m.snapshot ? { snapshot: m.snapshot as never } : {}),
      })
      .select("id").single();
    if (error || !match) throw error;
    const rows = m.players.map((p) => ({
      match_id: match.id, slot: p.slot, player_id: p.id, name: p.name,
      result: p.id && p.id === m.winnerId ? "win" : p.forfeited ? "forfeit" : "loss",
      rounds_won: p.roundsWon, walls_placed: p.wallsPlaced,
      pawns_eliminated: p.pawnsEliminated, forfeited: p.forfeited,
      // Only tag the caller's own row; bots and remote peers stay null so RLS
      // (auth_user_id IS NULL OR = auth.uid()) accepts the whole batch.
      auth_user_id: uid && p.id && p.id === myLocalId ? uid : null,
    }));
    await supabase.from("match_players").insert(rows);
    return match.id as string;
  } catch (err) { console.warn("recordMatch failed", err); return null; }
}

/**
 * Apply an ELO update for a completed ranked 1v1. Both stats rows are
 * updated atomically server-side so it doesn't matter which client calls
 * it — but call from ONE peer only (host) to avoid double-applying.
 * Returns the number of rating points transferred (positive integer), or
 * null on failure.
 */
export async function applyElo1v1(
  winnerPlayerId: string, winnerName: string,
  loserPlayerId: string, loserName: string,
): Promise<number | null> {
  try {
    await ensureAuthSession();
    const { data, error } = await supabase.rpc("apply_elo_1v1", {
      _winner_player_id: winnerPlayerId,
      _winner_name: winnerName,
      _loser_player_id: loserPlayerId,
      _loser_name: loserName,
    });
    if (error) throw error;
    return typeof data === "number" ? data : null;
  } catch (err) { console.warn("applyElo1v1 failed", err); return null; }
}

/** Stamp a match row with the ELO delta transferred for that ranked game. */
export async function setMatchEloDelta(matchId: string, delta: number) {
  try {
    await ensureAuthSession();
    await supabase.from("matches").update({ elo_delta: delta }).eq("id", matchId);
  } catch (err) { console.warn("setMatchEloDelta failed", err); }
}

export async function bumpMyStats(playerId: string, delta: Partial<{
  matches: number; wins: number; losses: number;
  walls_placed: number; pawns_eliminated: number; forfeits: number;
}>) {
  try {
    const uid = await ensureAuthSession();
    const { data: cur } = await supabase.from("player_stats").select("*").eq("player_id", playerId).maybeSingle();
    const base = cur ?? { player_id: playerId, matches: 0, wins: 0, losses: 0, walls_placed: 0, pawns_eliminated: 0, forfeits: 0 };
    const next = {
      player_id: playerId,
      matches: base.matches + (delta.matches ?? 0),
      wins: base.wins + (delta.wins ?? 0),
      losses: base.losses + (delta.losses ?? 0),
      walls_placed: base.walls_placed + (delta.walls_placed ?? 0),
      pawns_eliminated: base.pawns_eliminated + (delta.pawns_eliminated ?? 0),
      forfeits: base.forfeits + (delta.forfeits ?? 0),
      auth_user_id: uid,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("player_stats").upsert(next);
  } catch (err) { console.warn("bumpMyStats failed", err); }
}

export async function fetchMyStats(playerId: string) {
  const { data } = await supabase.from("player_stats").select("*").eq("player_id", playerId).maybeSingle();
  return data;
}

/**
 * Current win streak — number of consecutive most-recent matches with
 * result = "win" for this player. Stops at the first non-win.
 */
export async function fetchMyWinStreak(playerId: string): Promise<number> {
  const { data } = await supabase
    .from("match_players")
    .select("result, matches!inner(created_at)")
    .eq("player_id", playerId)
    .order("created_at", { referencedTable: "matches", ascending: false })
    .limit(50);
  if (!data?.length) return 0;
  let streak = 0;
  for (const row of data) {
    if (row.result === "win") streak++;
    else break;
  }
  return streak;
}

export async function fetchLeaderboard(limit = 20, rankedOnly = true): Promise<LeaderRow[]> {
  let q = supabase.from("player_stats").select("*");
  if (rankedOnly) q = q.gt("ranked_matches", 0);
  const { data: stats } = await q
    .order("rating", { ascending: false })
    .order("wins", { ascending: false })
    .limit(limit);
  if (!stats?.length) return [];
  const ids = stats.map((s) => s.player_id);
  const { data: players } = await supabase.from("players").select("id, name").in("id", ids);
  const nameById = new Map((players ?? []).map((p) => [p.id, p.name]));
  return stats.map((s) => ({
    id: s.player_id, name: nameById.get(s.player_id) ?? "Unknown",
    rating: (s as { rating?: number }).rating ?? 1000,
    wins: s.wins, matches: s.matches, losses: s.losses,
    walls_placed: s.walls_placed, pawns_eliminated: s.pawns_eliminated,
  }));
}

export async function registerOpenRoom(code: string, mode: 2 | 4, hostName: string, ranked = false) {
  try {
    const uid = await ensureAuthSession();
    await supabase.from("open_rooms").upsert({
      code, mode, host_name: hostName,
      seats_taken: 1, seats_total: mode,
      ranked,
      auth_user_id: uid,
      updated_at: new Date().toISOString(),
    });
  } catch (err) { console.warn("registerOpenRoom failed", err); }
}
export async function updateOpenRoomSeats(code: string, seats: number) {
  try {
    await ensureAuthSession();
    await supabase.from("open_rooms").update({ seats_taken: seats, updated_at: new Date().toISOString() }).eq("code", code);
  } catch (err) { console.warn("updateOpenRoomSeats failed", err); }
}
export async function removeOpenRoom(code: string) {
  try { await ensureAuthSession(); await supabase.from("open_rooms").delete().eq("code", code); } catch {}
}
export async function findOpenRoom(mode: 2 | 4, ranked = false): Promise<string | null> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase.from("open_rooms")
    .select("code, seats_taken, seats_total, ranked, updated_at")
    .eq("mode", mode).eq("ranked", ranked).gte("updated_at", cutoff)
    .order("created_at", { ascending: true }).limit(10);
  if (!data?.length) return null;
  for (const r of data) if (r.seats_taken < r.seats_total) return r.code;
  return null;
}

/**
 * Matchmaking race helper: when two searchers register their own rooms at the
 * same time (both saw an empty lobby before either row hit the DB), the newer
 * host needs to cede and join the older host. We return the oldest OTHER open
 * room with the same mode/ranked so the caller can decide to hand off.
 */
export async function findOpenRoomOlderThan(
  myCode: string, mode: 2 | 4, ranked = false,
): Promise<string | null> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase.from("open_rooms")
    .select("code, seats_taken, seats_total, updated_at")
    .eq("mode", mode).eq("ranked", ranked).gte("updated_at", cutoff)
    .neq("code", myCode)
    .order("created_at", { ascending: true }).limit(5);
  if (!data?.length) return null;
  for (const r of data) if (r.seats_taken < r.seats_total) return r.code;
  return null;
}

/** Count of matches played since 00:00 UTC today. */
export async function fetchGamesToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

/** Count of ranked open rooms currently waiting for opponents. */
export async function fetchQueueCount(): Promise<number> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("open_rooms")
    .select("seats_taken, seats_total")
    .gte("updated_at", cutoff);
  if (!data?.length) return 0;
  return data.filter((r) => r.seats_taken < r.seats_total).length;
}

export type LiveRoom = {
  code: string;
  mode: 2 | 4;
  ranked: boolean;
  hostName: string;
  seatsTaken: number;
  seatsTotal: number;
};

/** Currently-known open rooms (both waiting and full). Used for the spectate/live list. */
export async function fetchLiveRooms(limit = 6): Promise<LiveRoom[]> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("open_rooms")
    .select("code, mode, ranked, host_name, seats_taken, seats_total, updated_at")
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    code: r.code, mode: r.mode as 2 | 4, ranked: !!r.ranked,
    hostName: r.host_name ?? "Host",
    seatsTaken: r.seats_taken, seatsTotal: r.seats_total,
  }));
}

export type RecentMatchRow = {
  matchId: string;
  mode: 2 | 4;
  ranked: boolean;
  endedAt: string;
  result: "win" | "loss" | "forfeit";
  opponentName: string;
};

/** Recent matches for a specific player, most-recent first. */
export async function fetchRecentMatches(playerId: string, limit = 5): Promise<RecentMatchRow[]> {
  // Join match_players -> matches so we can order by ended_at (match_id is a
  // random UUID and ordering by it silently drops recent games).
  const { data: mine } = await supabase
    .from("match_players")
    .select("match_id, result, match:matches!inner(id, mode, ranked, ended_at, winner_player_id)")
    .eq("player_id", playerId)
    .order("ended_at", { referencedTable: "matches", ascending: false })
    .limit(limit);
  const ids = Array.from(new Set((mine ?? []).map((r) => r.match_id)));
  if (ids.length === 0) return [];
  const { data: others } = await supabase
    .from("match_players").select("match_id, player_id, name").in("match_id", ids);
  const myResultByMatch = new Map((mine ?? []).map((r) => [r.match_id, r.result as RecentMatchRow["result"]]));
  const matches = (mine ?? []).map((r) => (r as unknown as { match: { id: string; mode: number; ranked: boolean; ended_at: string; winner_player_id: string | null } }).match).filter(Boolean);
  return matches.map((m) => {
    const opps = (others ?? []).filter((p) => p.match_id === m.id && p.player_id !== playerId);
    const opp = opps[0]?.name ?? "Opponent";
    return {
      matchId: m.id, mode: m.mode as 2 | 4, ranked: !!m.ranked,
      endedAt: m.ended_at, result: myResultByMatch.get(m.id) ?? "loss",
      opponentName: opp,
    };
  });
}

/** Full ranked leaderboard rows, up to `limit`. Adds streak from recent matches. */
export type FullLeaderRow = LeaderRow & { streak: number; delta7d: number };

/** Approximate 7-day rating delta from ranked match count in the last week (±16 per ranked match, capped). */
async function fetchDelta7dMap(playerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!playerIds.length) return out;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("match_players")
    .select("player_id, result, matches!inner(ranked, ended_at)")
    .in("player_id", playerIds)
    .gte("matches.ended_at", since)
    .eq("matches.ranked", true);
  for (const r of (data ?? []) as Array<{ player_id: string; result: string }>) {
    const cur = out.get(r.player_id) ?? 0;
    out.set(r.player_id, cur + (r.result === "win" ? 16 : -16));
  }
  return out;
}

async function fetchStreakMap(playerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const pid of playerIds) {
    // Simple sequential fetch per player. Small N (top 10-20).
    // eslint-disable-next-line no-await-in-loop
    const s = await fetchMyWinStreak(pid);
    out.set(pid, s);
  }
  return out;
}

export async function fetchFullLeaderboard(limit = 50, rankedOnly = true): Promise<FullLeaderRow[]> {
  const base = await fetchLeaderboard(limit, rankedOnly);
  const ids = base.map((r) => r.id);
  const [dmap, smap] = await Promise.all([fetchDelta7dMap(ids), fetchStreakMap(ids)]);
  return base.map((r) => ({ ...r, streak: smap.get(r.id) ?? 0, delta7d: dmap.get(r.id) ?? 0 }));
}

/** Head-to-head record between two players (wins for a, wins for b). */
export async function fetchHeadToHead(aPlayerId: string, bPlayerId: string): Promise<{ a: number; b: number }> {
  const { data: aRows } = await supabase
    .from("match_players").select("match_id, result").eq("player_id", aPlayerId);
  const { data: bRows } = await supabase
    .from("match_players").select("match_id, result").eq("player_id", bPlayerId);
  const aById = new Map((aRows ?? []).map((r) => [r.match_id, r.result]));
  const bById = new Map((bRows ?? []).map((r) => [r.match_id, r.result]));
  let a = 0, b = 0;
  for (const [mid, ar] of aById) {
    const br = bById.get(mid); if (!br) continue;
    if (ar === "win" && br !== "win") a++;
    if (br === "win" && ar !== "win") b++;
  }
  return { a, b };
}

/** Update the caller's profile (bio + avatar_color). */
export async function updateMyProfile(
  playerId: string,
  patch: { bio?: string | null; avatar_color?: string | null },
): Promise<{ error: string | null }> {
  try {
    const uid = await ensureAuthSession();
    if (!uid) return { error: "not signed in" };
    const { error } = await supabase
      .from("players")
      .update({
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.avatar_color !== undefined ? { avatar_color: patch.avatar_color } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId)
      .eq("auth_user_id", uid);
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: (err as Error)?.message ?? "update failed" };
  }
}

/** Rename the caller's display name (30-day cooldown, server-enforced). */
export async function renameMyPlayer(playerId: string, newName: string): Promise<{
  ok: boolean; nextAllowedAt: string | null; message: string;
}> {
  try {
    await ensureAuthSession();
    const { data, error } = await supabase.rpc("rename_player", {
      _player_id: playerId, _new_name: newName,
    });
    if (error) return { ok: false, nextAllowedAt: null, message: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: !!row?.ok,
      nextAllowedAt: row?.next_allowed_at ?? null,
      message: row?.message ?? "",
    };
  } catch (err) {
    return { ok: false, nextAllowedAt: null, message: (err as Error)?.message ?? "rename failed" };
  }
}

/** Get a full profile view for the given player (players + stats + rank). */
export async function fetchProfile(playerId: string) {
  const [{ data: p }, { data: s }] = await Promise.all([
    supabase.from("players").select("id,name,country,bio,avatar_color,avatar_url,created_at,name_changed_at").eq("id", playerId).maybeSingle(),
    supabase.from("player_stats").select("*").eq("player_id", playerId).maybeSingle(),
  ]);
  let rank: number | null = null;
  if (s && (s as { rating?: number }).rating != null) {
    const { count } = await supabase
      .from("player_stats")
      .select("player_id", { count: "exact", head: true })
      .gt("rating", (s as { rating: number }).rating)
      .gt("ranked_matches", 0);
    rank = (count ?? 0) + 1;
  }
  return { player: p, stats: s, rank };
}

/** Players marked as friends of the given auth user (accepted only). */
export type FriendListItem = {
  friendshipId: string;
  playerId: string;
  authUserId: string;
  name: string;
  country: string | null;
  avatarColor: string | null;
  rating: number;
  matches: number;
};
export async function fetchAcceptedFriends(myAuthId: string): Promise<FriendListItem[]> {
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, requester_auth, addressee_auth, status")
    .eq("status", "accepted");
  if (!data?.length) return [];
  const items = data
    .map((r: { id: string; requester_id: string; addressee_id: string; requester_auth: string; addressee_auth: string }) => {
      const iAmReq = r.requester_auth === myAuthId;
      return {
        friendshipId: r.id,
        otherPlayerId: iAmReq ? r.addressee_id : r.requester_id,
        otherAuth: iAmReq ? r.addressee_auth : r.requester_auth,
      };
    });
  const ids = items.map((i) => i.otherPlayerId);
  const [{ data: players }, { data: stats }] = await Promise.all([
    supabase.from("players").select("id,name,country,avatar_color,auth_user_id").in("id", ids),
    supabase.from("player_stats").select("player_id,rating,matches").in("player_id", ids),
  ]);
  const pById = new Map((players ?? []).map((p: { id: string } & Record<string, unknown>) => [p.id, p]));
  const sById = new Map((stats ?? []).map((s: { player_id: string } & Record<string, unknown>) => [s.player_id, s]));
  return items
    .map((i) => {
      const p = pById.get(i.otherPlayerId) as { name?: string; country?: string | null; avatar_color?: string | null; auth_user_id?: string } | undefined;
      const s = sById.get(i.otherPlayerId) as { rating?: number; matches?: number } | undefined;
      if (!p) return null;
      return {
        friendshipId: i.friendshipId,
        playerId: i.otherPlayerId,
        authUserId: p.auth_user_id ?? i.otherAuth,
        name: p.name ?? "player",
        country: p.country ?? null,
        avatarColor: p.avatar_color ?? null,
        rating: s?.rating ?? 1000,
        matches: s?.matches ?? 0,
      } as FriendListItem;
    })
    .filter((x): x is FriendListItem => !!x);
}

/** Recent unique opponents (by player_id) the caller has faced, excluding accepted friends. */
export type RecentOpponent = {
  playerId: string;
  name: string;
  when: string;
  mode: string;
};
export async function fetchRecentOpponents(myPlayerId: string, limit = 8): Promise<RecentOpponent[]> {
  const { data: mine } = await supabase
    .from("match_players")
    .select("match_id")
    .eq("player_id", myPlayerId)
    .order("match_id", { ascending: false })
    .limit(40);
  const ids = Array.from(new Set((mine ?? []).map((r) => r.match_id)));
  if (!ids.length) return [];
  const [{ data: others }, { data: matches }] = await Promise.all([
    supabase.from("match_players").select("match_id, player_id, name").in("match_id", ids),
    supabase.from("matches").select("id, mode, ranked, ended_at").in("id", ids),
  ]);
  const mById = new Map((matches ?? []).map((m: { id: string } & Record<string, unknown>) => [m.id, m]));
  const seen = new Set<string>();
  const out: RecentOpponent[] = [];
  for (const o of (others ?? []) as Array<{ match_id: string; player_id: string | null; name: string }>) {
    if (!o.player_id || o.player_id === myPlayerId || seen.has(o.player_id)) continue;
    const pid = o.player_id;
    seen.add(pid);
    const m = mById.get(o.match_id) as { mode: number; ranked: boolean; ended_at: string } | undefined;
    if (!m) continue;
    out.push({
      playerId: pid,
      name: o.name,
      when: m.ended_at,
      mode: m.ranked ? "Ranked" : m.mode === 4 ? "4P free-for-all" : "Casual",
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Head-to-head history rows between me and them (up to `limit`). */
export async function fetchH2HHistory(mePlayerId: string, themPlayerId: string, limit = 5): Promise<RecentMatchRow[]> {
  const { data: mine } = await supabase
    .from("match_players").select("match_id, result").eq("player_id", mePlayerId);
  const { data: theirs } = await supabase
    .from("match_players").select("match_id, result, name").eq("player_id", themPlayerId);
  const mineById = new Map((mine ?? []).map((r) => [r.match_id, r.result as RecentMatchRow["result"]]));
  const commonIds = (theirs ?? []).filter((r) => mineById.has(r.match_id)).map((r) => r.match_id);
  if (!commonIds.length) return [];
  const { data: matches } = await supabase
    .from("matches").select("id, mode, ranked, ended_at")
    .in("id", commonIds).order("ended_at", { ascending: false }).limit(limit);
  const nameByMatch = new Map((theirs ?? []).map((r) => [r.match_id, r.name]));
  return (matches ?? []).map((m: { id: string; mode: number; ranked: boolean; ended_at: string }) => ({
    matchId: m.id, mode: m.mode as 2 | 4, ranked: !!m.ranked,
    endedAt: m.ended_at, result: mineById.get(m.id) ?? "loss",
    opponentName: nameByMatch.get(m.id) ?? "opponent",
  }));
}
