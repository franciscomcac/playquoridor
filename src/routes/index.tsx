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
  const [onlineCount, setOnlineCount] = useState<number>(() => computeOnline(0));

  useEffect(() => {
    let alive = true;
    void fetchLeaderboard(8)
      .then((r) => alive && setBoard(r))
      .catch(() => alive && setBoard([]));
    return () => { alive = false; };
  }, []);

  // Fluctuating online-players count. Baseline drifts between 150 and 200,
  // plus the count of real ranked players we know about.
  useEffect(() => {
    const real = board?.length ?? 0;
    setOnlineCount(computeOnline(real));
    const t = setInterval(() => setOnlineCount(computeOnline(real)), 6000);
    return () => clearInterval(t);
  }, [board]);

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

        {/* Compact centered hero — barricade-style */}
        <section className="mt-10 flex flex-col items-center text-center sm:mt-14">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Play <span className="text-amber-500">Quoridor</span>
          </h1>
          <button
            onClick={() => goPlay("quick2")}
            className="mt-6 inline-flex items-center gap-2.5 rounded-xl bg-emerald-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            Play Now
          </button>
          <p className="mt-3 text-xs text-zinc-500">Free — no account needed</p>
          <div className="mt-4 flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Matchmaking online
            </span>
            <span className="text-zinc-700">•</span>
            <span>{onlineCount} players online</span>
          </div>
        </section>

        {/* Lobby row — leaderboard | match setup | quick play */}
        <section className="mt-12 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* ELO Leaderboard */}
          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                <span className="text-amber-500">🏆</span> Leaderboard
              </h2>
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

          {/* Center: Live Lobby with match modes + private room */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight text-zinc-100">Live Lobby</h2>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
              </span>
            </div>

            <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Find Match</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ModeButton label="2 Players" sub="Casual" onClick={() => goPlay("quick2")} />
              <ModeButton label="4 Players" sub="Free-for-all" onClick={() => goPlay("quick4")} />
              <ModeButton label="Ranked" sub="ELO 1v1" tone="primary" onClick={() => goPlay("ranked2")} />
            </div>

            <div className="mt-5 border-t border-zinc-800 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Play With Friends</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => goPlay("create")}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-amber-400"
                >
                  + Create Room
                </button>
                <form
                  onSubmit={(e) => { e.preventDefault(); goJoin(cleanCode); }}
                  className="flex flex-1 gap-2"
                >
                  <input
                    value={cleanCode}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter room code…"
                    maxLength={5}
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm uppercase tracking-[0.3em] text-amber-400 placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
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
            </div>
          </div>

          {/* Right: Quick Play */}
          <div className="space-y-3 lg:col-span-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Quick Play</div>
            <QuickTile
              to="/game"
              onClick={() => { try { sessionStorage.setItem("quoridor:pendingAction", "create"); } catch {} }}
              label="CPU Practice"
              sub="vs Computer"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            />
            <QuickTile
              to="/puzzle"
              label="Daily Puzzle"
              sub="Today's position"
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

function ModeButton({
  label, sub, tone = "ghost", onClick,
}: { label: string; sub?: string; tone?: "primary" | "ghost"; onClick: () => void }) {
  const styles =
    tone === "primary"
      ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
      : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600 hover:bg-zinc-900";
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 ${styles}`}
    >
      <span className={`text-sm font-bold tracking-tight ${tone === "primary" ? "text-amber-400" : "text-zinc-100"}`}>
        {label}
      </span>
      {sub && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{sub}</span>
      )}
    </button>
  );
}

function _BoardArt() {
  // 9x9 board silhouette with two pawns and a couple of walls — pure geometry, no state
  const cells = Array.from({ length: 81 });
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-amber-500/10 via-transparent to-transparent blur-2xl" aria-hidden />
      <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-2xl shadow-black/40">
        <div className="grid aspect-square grid-cols-9 gap-1.5">
          {cells.map((_, i) => {
            const row = Math.floor(i / 9);
            const col = i % 9;
            const isTop = row === 0 && col === 4;
            const isBot = row === 8 && col === 4;
            return (
              <div
                key={i}
                className={
                  "relative rounded-[3px] " +
                  (isTop || isBot ? "bg-zinc-800" : "bg-zinc-900/70 ring-1 ring-inset ring-zinc-800/60")
                }
              >
                {isTop && <span className="absolute inset-1 rounded-full bg-zinc-200 shadow-[0_0_10px_rgba(255,255,255,0.35)]" />}
                {isBot && <span className="absolute inset-1 rounded-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />}
              </div>
            );
          })}
        </div>
        {/* Two decorative walls */}
        <span className="pointer-events-none absolute left-[24%] top-[38%] h-1.5 w-[20%] rounded-full bg-amber-500/80" aria-hidden />
        <span className="pointer-events-none absolute right-[20%] top-[58%] h-1.5 w-[20%] rounded-full bg-zinc-200/80" aria-hidden />
      </div>
    </div>
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