// Supabase reads/writes for stats, leaderboard, and Quick Match lobby index.
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthSession, getStoredIdentity } from "@/lib/identity";

export type MatchResult = {
  mode: 2 | 4;
  rounds: number;
  winnerId: string | null;
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
  wins: number;
  matches: number;
  losses: number;
  walls_placed: number;
  pawns_eliminated: number;
};

export async function recordMatch(m: MatchResult) {
  try {
    const uid = await ensureAuthSession();
    const myLocalId = getStoredIdentity()?.id ?? null;
    const { data: match, error } = await supabase
      .from("matches")
      .insert({ mode: m.mode, rounds: m.rounds, winner_player_id: m.winnerId })
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
  } catch (err) { console.warn("recordMatch failed", err); }
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

export async function fetchLeaderboard(limit = 20): Promise<LeaderRow[]> {
  const { data: stats } = await supabase.from("player_stats").select("*").order("wins", { ascending: false }).limit(limit);
  if (!stats?.length) return [];
  const ids = stats.map((s) => s.player_id);
  const { data: players } = await supabase.from("players").select("id, name").in("id", ids);
  const nameById = new Map((players ?? []).map((p) => [p.id, p.name]));
  return stats.map((s) => ({
    id: s.player_id, name: nameById.get(s.player_id) ?? "Unknown",
    wins: s.wins, matches: s.matches, losses: s.losses,
    walls_placed: s.walls_placed, pawns_eliminated: s.pawns_eliminated,
  }));
}

export async function registerOpenRoom(code: string, mode: 2 | 4, hostName: string) {
  try {
    const uid = await ensureAuthSession();
    await supabase.from("open_rooms").upsert({
      code, mode, host_name: hostName,
      seats_taken: 1, seats_total: mode,
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
export async function findOpenRoom(mode: 2 | 4): Promise<string | null> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase.from("open_rooms")
    .select("code, seats_taken, seats_total, updated_at")
    .eq("mode", mode).gte("updated_at", cutoff)
    .order("created_at", { ascending: true }).limit(10);
  if (!data?.length) return null;
  for (const r of data) if (r.seats_taken < r.seats_total) return r.code;
  return null;
}
