import { supabase } from "@/integrations/supabase/client";
import type { SigilTier } from "@/components/ConstellationSigil";

export type UnlockedAchievement = {
  slug: string;
  name: string;
  description: string;
  tier: SigilTier;
  sigil_key: string;
};

export type EvalContext = {
  playerId: string;
  mode: 2 | 4;
  ranked: boolean;
  iWon: boolean;
  forfeited: boolean;
  wallsThisMatch: number;
  pawnsThisMatch: number;
  opponentRating: number | null;
};

/**
 * After a match ends, ask the DB which achievement slugs just unlocked and
 * hydrate them with catalog metadata for the reveal overlay.
 */
export async function evaluatePostMatch(ctx: EvalContext): Promise<UnlockedAchievement[]> {
  try {
    const { data, error } = await supabase.rpc("evaluate_match_achievements", {
      _player_id: ctx.playerId,
      _mode: ctx.mode,
      _ranked: ctx.ranked,
      _i_won: ctx.iWon,
      _forfeited: ctx.forfeited,
      _walls_this_match: ctx.wallsThisMatch,
      _pawns_this_match: ctx.pawnsThisMatch,
      // The RPC treats NULL as "no rated opponent"; the generated typings
      // demand a number, so cast through unknown when we want to send null.
      _opponent_rating: (ctx.opponentRating ?? null) as unknown as number,
    });
    if (error) throw error;
    const slugs = ((data ?? []) as Array<{ slug: string }>).map((r) => r.slug).filter(Boolean);
    if (slugs.length === 0) return [];
    const { data: rows } = await supabase
      .from("achievements")
      .select("slug,name,description,tier,sigil_key,sort_order")
      .in("slug", slugs);
    const meta = new Map<string, UnlockedAchievement>();
    for (const r of (rows ?? []) as Array<{ slug: string; name: string; description: string; tier: SigilTier; sigil_key: string; sort_order: number }>) {
      meta.set(r.slug, { slug: r.slug, name: r.name, description: r.description, tier: r.tier, sigil_key: r.sigil_key });
    }
    // Preserve grant order from the RPC.
    return slugs.map((s) => meta.get(s)).filter((x): x is UnlockedAchievement => !!x);
  } catch (err) {
    console.warn("evaluatePostMatch failed", err);
    return [];
  }
}
