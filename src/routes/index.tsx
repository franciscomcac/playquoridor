import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeaderboard, type LeaderRow } from "@/lib/stats";

const SITE_URL = "https://playquoridor.online";
const TITLE = "Quoridor Online — Play now, free";
const DESC =
  "Play Quoridor free in your browser. Quick match, private rooms, 4-player free-for-alls, bot practice. No download, no signup.";

type OpenRoom = { code: string; host_name: string; mode: 2 | 4; seats_taken: number; seats_total: number };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: SITE_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Play Quoridor Online",
          url: SITE_URL,
          description: DESC,
          applicationCategory: "GameApplication",
          genre: "Strategy",
          operatingSystem: "Web Browser",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Lobby,
});

/* ============================================================
   Play-first lobby. Ready to play, minimal, cleaner than
   barricade.gg. Dark surface, gold accent, live data.
   ============================================================ */

function Lobby() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<OpenRoom[] | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [code, setCode] = useState("");
  const [quickMode, setQuickMode] = useState<2 | 4>(2);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("open_rooms")
        .select("code, host_name, mode, seats_taken, seats_total, updated_at")
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (!alive) return;
      const list = (data ?? [])
        .filter((r) => r.seats_taken < r.seats_total)
        .map((r) => ({
          code: r.code, host_name: r.host_name,
          mode: r.mode as 2 | 4,
          seats_taken: r.seats_taken, seats_total: r.seats_total,
        })) as OpenRoom[];
      setRooms(list);
    };
    void load();
    void fetchLeaderboard(5).then((r) => alive && setBoard(r)).catch(() => alive && setBoard([]));
    const iv = window.setInterval(() => void load(), 15000);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  const cleanCode = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5),
    [code],
  );

  function goPlay(action: "quick2" | "quick4" | "create") {
    try { sessionStorage.setItem("quoridor:pendingAction", action); } catch {}
    void navigate({ to: "/game" });
  }
  function goJoin(c: string) {
    if (c.length !== 5) return;
    try { sessionStorage.setItem("quoridor:pendingJoin", c); } catch {}
    void navigate({ to: "/game" });
  }

  const online = (rooms?.length ?? 0) * 2 + (board?.length ?? 0);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <TopBar />

        {/* Hero */}
        <section className="mt-6 flex flex-col items-center text-center sm:mt-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Play <span className="text-amber-500">Quoridor</span>
          </h1>

          <button
            onClick={() => goPlay(quickMode === 4 ? "quick4" : "quick2")}
            className="group relative mt-6 inline-flex items-center gap-3 rounded-xl bg-emerald-600 px-10 py-4 text-lg font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 active:translate-y-0"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            Play Now
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl bg-emerald-400 opacity-0 blur-xl transition-opacity group-hover:opacity-20" />
          </button>

          <div className="mt-5 flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.25em] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              {online} online
            </span>
            <span className="h-1 w-1 rounded-full bg-zinc-800" />
            <span>{rooms?.length ?? 0} open rooms</span>
          </div>

          {/* Mode pills */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
            {([2, 4] as const).map((m) => (
              <button
                key={m}
                onClick={() => setQuickMode(m)}
                className={
                  "rounded-full px-4 py-1.5 font-semibold uppercase tracking-widest transition-colors " +
                  (quickMode === m
                    ? "bg-zinc-800 text-amber-500"
                    : "text-zinc-500 hover:text-zinc-300")
                }
              >
                {m}P
              </button>
            ))}
          </div>
        </section>

        {/* Bento grid */}
        <section className="mt-10 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* Leaderboard */}
          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Leaderboard</h2>
              <Link to="/stats" className="text-[10px] text-amber-500 hover:underline">View all</Link>
            </div>
            <ol className="mt-4 space-y-1">
              {board === null && Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex animate-pulse items-center justify-between p-2">
                  <span className="h-3 w-24 rounded bg-zinc-800" />
                  <span className="h-3 w-8 rounded bg-zinc-800" />
                </li>
              ))}
              {board?.length === 0 && (
                <li className="p-2 text-xs text-zinc-500">No matches yet. Be the first.</li>
              )}
              {board?.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-zinc-800/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={"w-4 text-xs font-bold " + (i === 0 ? "text-amber-500" : "text-zinc-600")}>
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-medium">{r.name}</span>
                  </div>
                  <span className="font-mono text-xs text-zinc-400">{r.wins}</span>
                </li>
              ))}
            </ol>
          </aside>

          {/* Live lobby */}
          <div className="flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 lg:col-span-6">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/30 p-5">
              <h2 className="text-sm font-semibold">Open Rooms</h2>
              <span className="rounded-full bg-zinc-800/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Live
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rooms === null ? (
                <div className="p-10 text-center text-xs text-zinc-600">Loading rooms…</div>
              ) : rooms.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                  <div className="text-4xl opacity-30" aria-hidden>◇</div>
                  <p className="text-sm text-zinc-500">No open rooms right now.</p>
                  <button
                    onClick={() => goPlay(quickMode === 4 ? "quick4" : "quick2")}
                    className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                  >
                    Host a room →
                  </button>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-zinc-500">
                      <th className="px-5 py-3 font-semibold">Host</th>
                      <th className="px-5 py-3 text-center font-semibold">Mode</th>
                      <th className="px-5 py-3 text-center font-semibold">Seats</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {rooms.map((r) => (
                      <tr key={r.code} className="group transition-colors hover:bg-zinc-800/30">
                        <td className="px-5 py-3 text-sm font-medium">{r.host_name}</td>
                        <td className="px-5 py-3 text-center text-xs text-zinc-400">{r.mode}P</td>
                        <td className="px-5 py-3 text-center font-mono text-xs text-zinc-400">
                          {r.seats_taken}/{r.seats_total}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => goJoin(r.code)}
                            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-100 transition-colors hover:bg-amber-500 hover:text-zinc-950"
                          >
                            Join
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); goJoin(cleanCode); }}
              className="flex gap-2 border-t border-zinc-800 bg-zinc-900/80 p-4"
            >
              <input
                value={cleanCode}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter room code…"
                maxLength={5}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 font-mono text-sm uppercase tracking-[0.3em] text-amber-400 placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={cleanCode.length !== 5}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Join
              </button>
            </form>
          </div>

          {/* Right rail: create + quick actions */}
          <div className="space-y-4 lg:col-span-3">
            <div className="rounded-2xl border border-amber-500/25 bg-zinc-900 p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Create Game</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1 text-xs">
                  {([2, 4] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setQuickMode(m)}
                      className={
                        "flex-1 rounded-md py-1.5 font-bold uppercase tracking-widest transition-colors " +
                        (quickMode === m ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")
                      }
                    >
                      {m} Players
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => goPlay("create")}
                  className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/10 transition-all hover:-translate-y-0.5 hover:bg-amber-400"
                >
                  Create Room
                </button>
              </div>
            </div>

            <QuickTile
              to="/game"
              onClick={() => { try { sessionStorage.setItem("quoridor:pendingAction", "create"); } catch {} }}
              label="CPU Practice"
              sub="Improve your tactics"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            />
            <QuickTile
              to="/puzzle"
              label="Daily Puzzle"
              sub="Solve today's position"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>}
            />
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap justify-center gap-8 pt-6 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-600">
          <Link to="/about" className="hover:text-zinc-300">About</Link>
          <Link to="/stats" className="hover:text-zinc-300">Leaderboard</Link>
          <Link to="/puzzle" className="hover:text-zinc-300">Puzzles</Link>
          <a href="mailto:hi@playquoridor.online" className="hover:text-zinc-300">Contact</a>
        </footer>
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <nav className="flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2.5">
        <img
          src="/favicon.png"
          alt="Quoridor"
          width={32}
          height={32}
          className="h-8 w-8 rounded-md ring-1 ring-zinc-800"
        />
        <span className="text-sm font-semibold tracking-tight text-zinc-100">playquoridor.online</span>
      </Link>
      <div className="flex items-center gap-2">
        <Link to="/auth" className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800">
          Sign in
        </Link>
        <Link to="/game" className="rounded-md bg-amber-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-400">
          Lobby
        </Link>
      </div>
    </nav>
  );
}

function QuickTile({
  to, label, sub, icon, onClick,
}: { to: string; label: string; sub: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-600"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 transition-colors group-hover:bg-zinc-700 group-hover:text-amber-400">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-zinc-100">{label}</span>
        <span className="block text-[10px] text-zinc-500">{sub}</span>
      </span>
    </Link>
  );
}