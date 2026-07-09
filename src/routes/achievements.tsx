import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LobbyChrome } from "@/components/LobbyChrome";
import { ConstellationSigil, type SigilTier } from "@/components/ConstellationSigil";
import { supabase } from "@/integrations/supabase/client";
import { requireRealUser } from "@/lib/auth-gate";

type Achievement = {
  slug: string;
  name: string;
  description: string;
  tier: SigilTier;
  category: string;
  sigil_key: string;
  is_hidden: boolean;
  sort_order: number;
};

type Unlock = { achievement_slug: string; unlocked_at: string };

const CATEGORY_LABEL: Record<string, string> = {
  debut: "Debut",
  wins: "Wins",
  streaks: "Streaks",
  rank: "Rank",
  walls: "Walls",
  skill: "Skill",
  modes: "Game Modes",
  puzzles: "Puzzles",
  social: "Social",
  conduct: "Conduct",
  milestones: "Milestones",
  identity: "Identity",
  seasonal: "Seasonal",
  secret: "Hidden",
};

const CATEGORY_ORDER = [
  "debut","wins","streaks","rank","walls","skill","modes",
  "puzzles","social","conduct","milestones","identity","seasonal","secret",
];

export const Route = createFileRoute("/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements · playquoridor.online" },
      { name: "description", content: "Unlock constellation sigils across 60+ Quoridor achievements — win streaks, rank tiers, wall mastery, puzzle streaks and hidden secrets." },
      { property: "og:title", content: "Quoridor Achievements — playquoridor.online" },
      { property: "og:description", content: "60+ constellation sigils to unlock across wins, streaks, rank tiers and hidden secrets." },
      { property: "og:url", content: "https://playquoridor.online/achievements" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://playquoridor.online/achievements" }],
  }),
  component: AchievementsPage,
});

function AchievementsPage() {
  const [catalog, setCatalog] = useState<Achievement[] | null>(null);
  const [unlocks, setUnlocks] = useState<Map<string, string>>(new Map());
  const [meLoading, setMeLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");

  useEffect(() => {
    void supabase
      .from("achievements")
      .select("slug,name,description,tier,category,sigil_key,is_hidden,sort_order")
      .order("sort_order", { ascending: true })
      .then(({ data }) => setCatalog((data ?? []) as Achievement[]));
  }, []);

  useEffect(() => {
    void requireRealUser().then(async (me) => {
      setMeLoading(false);
      if (!me) { setSignedIn(false); return; }
      setSignedIn(true);
      const { data } = await supabase
        .from("player_achievements")
        .select("achievement_slug,unlocked_at")
        .eq("player_id", me.playerId);
      const m = new Map<string, string>();
      for (const u of (data ?? []) as Unlock[]) m.set(u.achievement_slug, u.unlocked_at);
      setUnlocks(m);
    });
  }, []);

  const grouped = useMemo(() => {
    if (!catalog) return null;
    const g = new Map<string, Achievement[]>();
    for (const a of catalog) {
      const isUnlocked = unlocks.has(a.slug);
      if (filter === "unlocked" && !isUnlocked) continue;
      if (filter === "locked" && isUnlocked) continue;
      if (a.is_hidden && !isUnlocked) {
        // Show hidden badges as a mystery card, not omitted
      }
      const key = a.category;
      const arr = g.get(key) ?? [];
      arr.push(a);
      g.set(key, arr);
    }
    return CATEGORY_ORDER
      .map((k) => ({ key: k, items: g.get(k) ?? [] }))
      .filter((c) => c.items.length > 0);
  }, [catalog, unlocks, filter]);

  const unlockedCount = unlocks.size;
  const totalCount = catalog?.length ?? 0;

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Sigil Codex</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">Achievements</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Unlock constellation sigils by winning, climbing rank, mastering walls and discovering hidden feats.
              Pin up to 3 to your profile.
            </p>
          </div>
          {signedIn && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Collected</p>
              <p className="mt-1 font-mono text-2xl text-zinc-100">
                <span className="text-emerald-300">{unlockedCount}</span>
                <span className="text-zinc-600"> / {totalCount}</span>
              </p>
            </div>
          )}
        </header>

        <div className="mb-6 flex gap-2">
          {(["all","unlocked","locked"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-widest transition " +
                (filter === k
                  ? "bg-emerald-500 text-emerald-950"
                  : "border border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200")
              }
            >
              {k}
            </button>
          ))}
          {!signedIn && !meLoading && (
            <Link to="/auth" className="ml-auto rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/20">
              Sign in to track
            </Link>
          )}
        </div>

        {!grouped && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-zinc-900/60" />
            ))}
          </div>
        )}

        {grouped?.map((cat) => (
          <section key={cat.key} className="mb-10">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              {CATEGORY_LABEL[cat.key] ?? cat.key}
              <span className="ml-2 text-zinc-700">
                {cat.items.filter((a) => unlocks.has(a.slug)).length}/{cat.items.length}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {cat.items.map((a) => {
                const unlocked = unlocks.has(a.slug);
                const hiddenLocked = a.is_hidden && !unlocked;
                return (
                  <div
                    key={a.slug}
                    className={
                      "group relative flex flex-col items-center rounded-2xl border p-4 text-center transition " +
                      (unlocked
                        ? "border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-white/20"
                        : "border-white/5 bg-black/40")
                    }
                  >
                    <ConstellationSigil
                      sigilKey={hiddenLocked ? "hidden" : a.sigil_key}
                      tier={a.tier}
                      size={96}
                      locked={!unlocked}
                    />
                    <p className={"mt-3 text-sm font-semibold " + (unlocked ? "text-zinc-100" : "text-zinc-500")}>
                      {hiddenLocked ? "???" : a.name}
                    </p>
                    <p className={"mt-1 text-[11px] leading-snug " + (unlocked ? "text-zinc-400" : "text-zinc-600")}>
                      {hiddenLocked ? "Hidden achievement" : a.description}
                    </p>
                    <span
                      className={
                        "mt-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest " +
                        tierChip(a.tier, unlocked)
                      }
                    >
                      {a.tier}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </LobbyChrome>
  );
}

function tierChip(tier: SigilTier, unlocked: boolean): string {
  if (!unlocked) return "bg-zinc-900 text-zinc-600";
  switch (tier) {
    case "bronze": return "bg-amber-500/15 text-amber-300";
    case "silver": return "bg-slate-400/15 text-slate-200";
    case "gold": return "bg-yellow-400/15 text-yellow-200";
    case "platinum": return "bg-cyan-400/15 text-cyan-200";
    case "mythic": return "bg-fuchsia-500/15 text-fuchsia-200";
  }
}