import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Avatar,
  PLACEMENT_GAMES,
  UNRANKED_COLOR,
  isPlacement,
  placementRemaining,
  tierFromRating,
} from "@/components/LobbyChrome";
import { fetchProfile, fetchRecentMatches, type RecentMatchRow } from "@/lib/stats";

export const Route = createFileRoute("/player/$playerId")({
  head: () => ({
    meta: [
      { title: "Player profile · playquoridor.online" },
      {
        name: "description",
        content: "Public Quoridor player profile: rating, record, and recent matches.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: PlayerPage,
  notFoundComponent: () => (
    <Shell>
      <p className="text-rose-400">Player not found.</p>
    </Shell>
  ),
  errorComponent: () => (
    <Shell>
      <p className="text-rose-400">Couldn't load player.</p>
    </Shell>
  ),
});

function PlayerPage() {
  const { playerId } = useParams({ from: "/player/$playerId" });
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchProfile>> | null>(null);
  const [recent, setRecent] = useState<RecentMatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [p, r] = await Promise.all([fetchProfile(playerId), fetchRecentMatches(playerId, 8)]);
        setProfile(p);
        setRecent(r);
      } finally {
        setLoading(false);
      }
    })();
  }, [playerId]);

  if (loading)
    return (
      <Shell>
        <p className="text-zinc-500">Loading…</p>
      </Shell>
    );
  const p = profile?.player as
    | {
        name?: string;
        country?: string | null;
        bio?: string | null;
        avatar_color?: string | null;
        avatar_url?: string | null;
      }
    | null
    | undefined;
  const s = profile?.stats as
    | {
        rating?: number;
        matches?: number;
        wins?: number;
        losses?: number;
        walls_placed?: number;
        pawns_eliminated?: number;
        ranked_matches?: number;
      }
    | null
    | undefined;
  if (!p)
    return (
      <Shell>
        <p className="text-rose-400">Player not found.</p>
      </Shell>
    );

  const rating = s?.rating ?? 1000;
  const rankedMatches = s?.ranked_matches ?? 0;
  const unranked = isPlacement(rankedMatches);
  const tier = tierFromRating(rating);
  const winRate =
    s && (s.matches ?? 0) > 0 ? Math.round((100 * (s.wins ?? 0)) / (s.matches ?? 1)) : null;

  return (
    <Shell>
      <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <Avatar
          name={p.name ?? "player"}
          color={p.avatar_color}
          imageUrl={p.avatar_url ?? undefined}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{p.name ?? "player"}</h1>
          <p
            className="text-[11px] uppercase tracking-widest"
            style={{ color: unranked ? UNRANKED_COLOR : undefined }}
          >
            {unranked
              ? `Unranked · ${placementRemaining(rankedMatches)}/${PLACEMENT_GAMES} placements left · ${p.country ?? "—"}`
              : `${tier.name} · ${rating} · ${p.country ?? "—"}`}
          </p>
          {p.bio && <p className="mt-2 text-sm text-zinc-300">{p.bio}</p>}
        </div>
        {!unranked && profile?.rank && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Rank</p>
            <p className="text-2xl font-bold">#{profile.rank}</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matches" value={s?.matches ?? 0} />
        <Stat label="Wins" value={s?.wins ?? 0} />
        <Stat label="Losses" value={s?.losses ?? 0} />
        <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} />
        <Stat label="Walls placed" value={s?.walls_placed ?? 0} />
        <Stat label="Pawns eliminated" value={s?.pawns_eliminated ?? 0} />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Recent matches
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No matches yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
            {recent.map((m) => (
              <li key={m.matchId} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-zinc-300">vs {m.opponentName}</span>
                <span className="flex items-center gap-3 text-[11px] text-zinc-500">
                  <span>{new Date(m.endedAt).toLocaleDateString()}</span>
                  <span className={m.result === "win" ? "text-emerald-400" : "text-rose-400"}>
                    {m.result}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link
          to="/"
          className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          ← Home
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
