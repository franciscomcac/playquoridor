import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchLeaderboard, fetchMyStats, type LeaderRow } from "@/lib/stats";
import { getStoredIdentity } from "@/lib/identity";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Quoridor Stats & Leaderboard — playquoridor.online" },
      { name: "description", content: "Global Quoridor leaderboard, top players by wins, and your personal match stats. Free online Quoridor at playquoridor.online." },
      { property: "og:title", content: "Quoridor Stats & Leaderboard — playquoridor.online" },
      { property: "og:description", content: "See the leaderboard and your own Quoridor stats — free online Quoridor." },
      { property: "og:url", content: "https://playquoridor.online/stats" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://playquoridor.online/stats" }],
  }),
  component: StatsPage,
});

type Mine = {
  matches: number; wins: number; losses: number;
  walls_placed: number; pawns_eliminated: number; forfeits: number;
} | null;

function StatsPage() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [mine, setMine] = useState<Mine>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    void fetchLeaderboard(20).then(setRows).catch(() => setRows([]));
    const ident = getStoredIdentity();
    if (ident) {
      setName(ident.name);
      void fetchMyStats(ident.id).then((s) =>
        setMine(s ? {
          matches: s.matches, wins: s.wins, losses: s.losses,
          walls_placed: s.walls_placed, pawns_eliminated: s.pawns_eliminated, forfeits: s.forfeits,
        } : { matches: 0, wins: 0, losses: 0, walls_placed: 0, pawns_eliminated: 0, forfeits: 0 }),
      );
    }
  }, []);

  const rate = mine && mine.matches > 0 ? Math.round((mine.wins / mine.matches) * 100) : 0;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">← Back</Link>
          <h1 className="text-2xl">Stats</h1>
        </div>

        {mine && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">You · {name}</p>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              <Stat label="Matches" value={mine.matches} />
              <Stat label="Wins" value={mine.wins} />
              <Stat label="Losses" value={mine.losses} />
              <Stat label="Win %" value={`${rate}%`} />
              <Stat label="Walls" value={mine.walls_placed} />
              <Stat label="Pops" value={mine.pawns_eliminated} />
            </div>
            {mine.forfeits > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">Forfeits: {mine.forfeits}</p>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Leaderboard · top 20</p>
          {rows === null ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No matches recorded yet. Be the first!</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 text-left">#</th>
                    <th className="py-2 text-left">Player</th>
                    <th className="py-2 text-right">Wins</th>
                    <th className="py-2 text-right">Matches</th>
                    <th className="py-2 text-right">Walls</th>
                    <th className="py-2 text-right">Pops</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2">{i + 1}</td>
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="py-2 text-right font-semibold text-primary">{r.wins}</td>
                      <td className="py-2 text-right">{r.matches}</td>
                      <td className="py-2 text-right">{r.walls_placed}</td>
                      <td className="py-2 text-right">{r.pawns_eliminated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-3 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}
