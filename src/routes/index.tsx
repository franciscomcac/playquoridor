import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { fetchLeaderboard, type LeaderRow } from "@/lib/stats";

const SITE_URL = "https://playquoridor.online";
const TITLE = "Quoridor Online — Play now, free";
const DESC =
  "Play Quoridor free in your browser. Quick match, private rooms, 4-player free-for-alls, bot practice. No download, no signup.";

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
   Play-first lobby. Three big Find-Match cards, ELO leaderboard,
   private room code join. No open-rooms list — matchmaking is
   handled server-side by /game.
   ============================================================ */

function Lobby() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchLeaderboard(8)
      .then((r) => alive && setBoard(r))
      .catch(() => alive && setBoard([]));
    return () => { alive = false; };
  }, []);

  const cleanCode = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5),
    [code],
  );

  function goPlay(action: "quick2" | "quick4" | "ranked2" | "create") {
    try { sessionStorage.setItem("quoridor:pendingAction", action); } catch {}
    void navigate({ to: "/game" });
  }
  function goJoin(c: string) {
    if (c.length !== 5) return;
    try { sessionStorage.setItem("quoridor:pendingJoin", c); } catch {}
    void navigate({ to: "/game" });
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <TopBar />

        {/* Hero — split, geometric */}
        <section className="mt-10 grid grid-cols-1 items-center gap-10 sm:mt-16 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Matchmaking live
            </span>
            <h1 className="mt-5 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Play <span className="text-amber-500">Quoridor</span>.
            </h1>
            <p className="mt-4 max-w-md text-base text-zinc-500">
              Two walls, one pawn, a race across the board. Pick a mode and jump in.
            </p>

            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <ModeButton label="2 Players" tone="primary" onClick={() => goPlay("quick2")} />
              <ModeButton label="4 Players" tone="ghost" onClick={() => goPlay("quick4")} />
              <ModeButton label="Ranked" tone="ghost" badge="ELO" onClick={() => goPlay("ranked2")} />
            </div>
          </div>

          <BoardArt />
        </section>

        {/* Bento — leaderboard + private + quick actions */}
        <section className="mt-16 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* ELO Leaderboard */}
          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">ELO Ladder</h2>
              <Link to="/stats" className="text-[10px] text-amber-500 hover:underline">View all</Link>
            </div>
            <ol className="mt-4 space-y-1">
              {board === null && Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex animate-pulse items-center justify-between p-2">
                  <span className="h-3 w-24 rounded bg-zinc-800" />
                  <span className="h-3 w-10 rounded bg-zinc-800" />
                </li>
              ))}
              {board?.length === 0 && (
                <li className="p-2 text-xs text-zinc-500">No ranked matches yet. Be the first.</li>
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
                  <span className="font-mono text-xs tabular-nums text-amber-400/90">{r.rating}</span>
                </li>
              ))}
            </ol>
          </aside>

          {/* Private room */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Play With Friends</h3>
            <p className="mt-2 text-xs text-zinc-500">Create a private room, share the code, or join one you were sent.</p>
            <button
              onClick={() => goPlay("create")}
              className="mt-4 w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/10 transition-all hover:-translate-y-0.5 hover:bg-amber-400"
            >
              Create Private Room
            </button>
            <form
              onSubmit={(e) => { e.preventDefault(); goJoin(cleanCode); }}
              className="mt-3 flex gap-2"
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

          {/* Right rail: quick actions */}
          <div className="space-y-4 lg:col-span-3">
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

function FindMatchCard({
  label, sub, desc, accent, badge, onClick,
}: {
  label: string; sub: string; desc: string;
  accent: "emerald" | "sky" | "amber"; badge?: string;
  onClick: () => void;
}) {
  const tone = {
    emerald: { ring: "hover:border-emerald-500/40", dot: "bg-emerald-500", cta: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40" },
    sky:     { ring: "hover:border-sky-500/40",     dot: "bg-sky-500",     cta: "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-900/40" },
    amber:   { ring: "hover:border-amber-500/50",   dot: "bg-amber-500",   cta: "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20" },
  }[accent];
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-start rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-left transition-all hover:-translate-y-0.5 ${tone.ring}`}
    >
      {badge && (
        <span className="absolute right-4 top-4 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.25em] text-amber-400">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        Find Match
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-zinc-50">{label}</div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-500">{sub}</div>
      <p className="mt-3 text-sm text-zinc-400">{desc}</p>
      <span className={`mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest shadow-lg transition-all ${tone.cta}`}>
        Play
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
      </span>
    </button>
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