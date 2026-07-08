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
  rating: number; ranked_matches: number; ranked_wins: number; ranked_losses: number;
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
          rating: (s as { rating?: number }).rating ?? 1000,
          ranked_matches: (s as { ranked_matches?: number }).ranked_matches ?? 0,
          ranked_wins: (s as { ranked_wins?: number }).ranked_wins ?? 0,
          ranked_losses: (s as { ranked_losses?: number }).ranked_losses ?? 0,
          walls_placed: s.walls_placed, pawns_eliminated: s.pawns_eliminated, forfeits: s.forfeits,
        } : { matches: 0, wins: 0, losses: 0, rating: 1000, ranked_matches: 0, ranked_wins: 0, ranked_losses: 0, walls_placed: 0, pawns_eliminated: 0, forfeits: 0 }),
      );
    }
  }, []);

  const rate = mine && mine.matches > 0 ? Math.round((mine.wins / mine.matches) * 100) : 0;

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-primary">← Back</Link>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        </div>

        {mine && (
          <section className="mt-6 rounded-2xl border border-border bg-card/60 p-6 shadow-xl backdrop-blur">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">You · {name}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
                ELO <span className="ml-2 font-mono text-base text-primary">{mine.rating}</span>
              </p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              <Stat label="Rating" value={mine.rating} accent />
              <Stat label="Ranked W" value={mine.ranked_wins} />
              <Stat label="Ranked L" value={mine.ranked_losses} />
              <Stat label="Matches" value={mine.matches} />
              <Stat label="Win %" value={`${rate}%`} />
              <Stat label="Walls" value={mine.walls_placed} />
            </div>
            {mine.forfeits > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">Forfeits: {mine.forfeits}</p>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-6 shadow-xl backdrop-blur">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">ELO Ladder · Top 20</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">Ranked only</p>
          </div>
          {rows === null ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No ranked matches yet. Be the first — play a ranked 1v1.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 text-left font-semibold">#</th>
                    <th className="py-2 text-left font-semibold">Player</th>
                    <th className="py-2 text-right font-semibold">ELO</th>
                    <th className="py-2 text-right font-semibold">Wins</th>
                    <th className="py-2 text-right font-semibold">Losses</th>
                    <th className="py-2 text-right font-semibold">Matches</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-border/60 transition-colors hover:bg-secondary/30">
                      <td className={"py-2.5 " + (i === 0 ? "font-bold text-primary" : i < 3 ? "font-semibold text-foreground" : "text-muted-foreground")}>{i + 1}</td>
                      <td className="py-2.5 font-medium">{r.name}</td>
                      <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-primary">{r.rating}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{r.wins}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{r.losses}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{r.matches}</td>
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

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={"rounded-lg border px-3 py-3 text-center " + (accent ? "border-primary/40 bg-primary/5" : "border-border bg-background/40")}>
      <p className={"text-lg font-semibold tabular-nums " + (accent ? "text-primary" : "")}>{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}
