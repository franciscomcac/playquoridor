// Group tiered achievement slugs (win_10 / win_50 / win_100 / ...) into a
// single "family" so the profile and achievements page can show one card
// per family with a level pip (Lv 1..N) instead of one card per slug. Data
// in the DB is unchanged; this is a pure display transform.

import type { SigilTier } from "@/components/ConstellationSigil";

// Ordered slugs, weakest → strongest. The first unlocked slug = level 1.
export type Family = {
  id: string;              // family identifier used as React key
  name: string;            // display name (e.g. "Wins")
  category: string;        // maps to the achievements.category column
  slugs: string[];         // ordered ascending in strength
};

export const FAMILIES: Family[] = [
  { id: "wins",       name: "Wins",         category: "wins",       slugs: ["win_10","win_50","win_100","win_500","win_1000"] },
  { id: "streaks",    name: "Win Streaks",  category: "streaks",    slugs: ["streak_3","streak_5","streak_10","streak_20"] },
  { id: "walls",      name: "Walls Placed", category: "walls",      slugs: ["walls_100","walls_500","walls_2000"] },
  { id: "matches",    name: "Matches",      category: "milestones", slugs: ["matches_10","matches_100","matches_500","matches_2000"] },
  { id: "rounds",     name: "Rounds",       category: "milestones", slugs: ["rounds_500","rounds_2000"] },
  { id: "rank",       name: "Rank",         category: "rank",       slugs: ["rank_1200","rank_1400","rank_1600","rank_1800","rank_2000","rank_2200"] },
  { id: "mode_2p",    name: "Duel Mode",    category: "modes",      slugs: ["mode_2p_50"] },
  { id: "mode_4p",    name: "Chaos Mode",   category: "modes",      slugs: ["mode_4p_25","mode_4p_100"] },
  { id: "puzzles",    name: "Puzzles",      category: "puzzles",    slugs: ["puzzle_7","puzzle_30","puzzle_100"] },
  { id: "friends",    name: "Friends",      category: "social",     slugs: ["friend_1","friend_5","friend_20"] },
  { id: "conduct",    name: "Fair Play",    category: "conduct",    slugs: ["clean_100","clean_500"] },
  { id: "banner",     name: "Ambassador",   category: "identity",   slugs: ["flag_bearer","ambassador"] },
  { id: "giant",      name: "Giant Slayer", category: "skill",      slugs: ["giant_slayer","giant_slayer_10"] },
];

// Reverse index: slug -> { familyId, level (1-based) }.
const SLUG_INDEX: Map<string, { familyId: string; level: number; maxLevel: number }> = (() => {
  const m = new Map<string, { familyId: string; level: number; maxLevel: number }>();
  for (const fam of FAMILIES) {
    fam.slugs.forEach((s, i) => m.set(s, { familyId: fam.id, level: i + 1, maxLevel: fam.slugs.length }));
  }
  return m;
})();

export function familyOf(slug: string): { familyId: string; level: number; maxLevel: number } | null {
  return SLUG_INDEX.get(slug) ?? null;
}

export type FamilyView = {
  family: Family;
  currentLevel: number;              // 0 if none unlocked yet
  currentSlug: string | null;        // highest unlocked slug (drives tier/sigil)
  nextSlug: string | null;           // next level slug, if any
  tier: SigilTier;                   // tier of currentSlug (or nextSlug when locked)
  sigilKey: string;                  // sigil to render
  name: string;                      // display name of current slug (or family)
  description: string | null;        // description of current or next slug
};

// Compute a FamilyView from a family + catalog (slug -> tier/sigil/name/desc)
// + unlocked set.
export type SlugMeta = { slug: string; name: string; description: string; tier: SigilTier; sigil_key: string };

export function familyView(fam: Family, catalog: Map<string, SlugMeta>, unlocked: Set<string>): FamilyView {
  let currentLevel = 0;
  let currentSlug: string | null = null;
  for (let i = fam.slugs.length - 1; i >= 0; i--) {
    if (unlocked.has(fam.slugs[i])) { currentLevel = i + 1; currentSlug = fam.slugs[i]; break; }
  }
  const nextSlug = currentLevel < fam.slugs.length ? fam.slugs[currentLevel] : null;
  const source = currentSlug ?? nextSlug ?? fam.slugs[0];
  const meta = catalog.get(source);
  return {
    family: fam,
    currentLevel,
    currentSlug,
    nextSlug,
    tier: meta?.tier ?? "bronze",
    sigilKey: meta?.sigil_key ?? "hidden",
    name: currentSlug ? (catalog.get(currentSlug)?.name ?? fam.name) : fam.name,
    description: (catalog.get(currentSlug ?? nextSlug ?? source)?.description) ?? null,
  };
}

// Split a catalog into { families: FamilyView[], singles: SlugMeta[] } — the
// singles are all slugs that don't belong to any family.
export function partitionCatalog(catalog: SlugMeta[], unlocked: Set<string>): {
  families: FamilyView[];
  singles: SlugMeta[];
} {
  const byId = new Map<string, SlugMeta>();
  for (const c of catalog) byId.set(c.slug, c);
  const families = FAMILIES
    .filter((fam) => fam.slugs.some((s) => byId.has(s)))
    .map((fam) => familyView(fam, byId, unlocked));
  const familySlugs = new Set<string>();
  for (const fam of FAMILIES) for (const s of fam.slugs) familySlugs.add(s);
  const singles = catalog.filter((c) => !familySlugs.has(c.slug));
  return { families, singles };
}