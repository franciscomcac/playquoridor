import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { fetchLeaderboard, type LeaderRow } from "@/lib/stats";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRY_BY_ISO } from "@/lib/countries";
import { AnimatePresence, motion } from "framer-motion";
import { AccountNav } from "@/components/AccountNav";

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
  return <LobbyInner />;
}

function computeOnline(real: number): number {
  // Baseline drifts smoothly between 150 and 200 using time, plus a bit of
  // jitter, plus every real ranked player we know about.
  const t = Date.now() / 60000; // minutes
  const wave = (Math.sin(t / 3.1) + Math.sin(t / 1.7 + 1.3)) / 2; // -1..1
  const base = 175 + Math.round(wave * 22); // ~153..197
  const jitter = Math.floor(Math.random() * 5); // 0..4
  const n = base + jitter + real;
  return Math.max(150, Math.min(260, n));
}

function LobbyInner() {
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
  function goCpu(diff: "easy" | "medium" | "hard") {
    try { sessionStorage.setItem("quoridor:pendingAction", `cpu:${diff}`); } catch {}
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
            className="group mt-8 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-12 py-5 text-lg font-bold text-white shadow-[0_20px_50px_-15px_rgba(16,185,129,0.6)] ring-1 ring-emerald-400/50 transition-all hover:-translate-y-0.5 hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_25px_55px_-15px_rgba(16,185,129,0.75)] active:translate-y-0"
          >
            <svg className="h-5 w-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            Play Now
          </button>
          <p className="mt-3 text-sm text-zinc-300">Free — no account needed</p>
          <div className="mt-4 flex items-center gap-3 text-xs text-zinc-300">
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
                <li className="p-2 text-sm text-zinc-300">No ranked matches yet. Be the first.</li>
              )}
              {board?.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-zinc-800/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={"w-4 text-xs font-bold " + (i === 0 ? "text-amber-500" : "text-zinc-300")}>
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

            <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-zinc-300">Find Match</div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <ModeButton label="2 Players" sub="Casual" onClick={() => goPlay("quick2")} />
              <ModeButton label="4 Players" sub="Free-for-all" onClick={() => goPlay("quick4")} badge="CHAOS" />
              <ModeButton label="Ranked" sub="ELO 1v1" tone="primary" onClick={() => goPlay("ranked2")} />
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Play With Friends</div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => goPlay("create")}
                  className="rounded-xl bg-amber-500 px-5 py-3 text-xs font-bold uppercase tracking-widest text-zinc-950 shadow-lg shadow-amber-900/30 transition-all hover:-translate-y-0.5 hover:bg-amber-400"
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
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-sm uppercase tracking-[0.3em] text-amber-400 placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={cleanCode.length !== 5}
                    className="rounded-xl bg-zinc-800 px-5 py-3 text-xs font-bold uppercase tracking-widest text-zinc-100 transition-all hover:-translate-y-0.5 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    Join
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right: Quick Play */}
          <div className="space-y-3 lg:col-span-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Quick Play</div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center gap-2 px-1 pb-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-800 text-zinc-300">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">CPU Practice</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-300">Choose difficulty</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <CpuBtn onClick={() => goCpu("easy")} tone="emerald" tier="Easy" name="Tom" />
                <CpuBtn onClick={() => goCpu("medium")} tone="amber" tier="Medium" name="Jackeline" />
                <CpuBtn onClick={() => goCpu("hard")} tone="rose" tier="Hard" name="Rachel" />
              </div>
            </div>
            <QuickTile
              to="/puzzle"
              label="Daily Puzzle"
              sub="Today's position"
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>}
            />
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap justify-center gap-8 pt-6 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-300">
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
      <AccountNav />
    </nav>
  );
}

function ModeButton({
  label, sub, tone = "ghost", onClick, badge,
}: { label: string; sub?: string; tone?: "primary" | "ghost"; onClick: () => void; badge?: string }) {
  const styles =
    tone === "primary"
      ? "border-amber-500/50 bg-gradient-to-b from-amber-500/20 to-amber-500/5 shadow-lg shadow-amber-900/20 hover:border-amber-400 hover:from-amber-500/30 hover:to-amber-500/10"
      : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-500 hover:bg-zinc-900";
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-start gap-1 rounded-xl border px-4 py-4 text-left transition-all hover:-translate-y-1 ${styles}`}
    >
      {badge && (
        <span className="absolute -right-2 -top-2 rounded-md bg-gradient-to-r from-fuchsia-500 to-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse">
          ⚡ {badge}
        </span>
      )}
      <span className={`text-base font-bold tracking-tight ${tone === "primary" ? "text-amber-300" : "text-zinc-100"}`}>
        {label}
      </span>
      {sub && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300">{sub}</span>
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
        <span className="block text-xs text-zinc-300">{sub}</span>
      </span>
    </Link>
  );
}

function CpuBtn({
  onClick, tier, name, tone,
}: { onClick: () => void; tier: "Easy" | "Medium" | "Hard"; name: string; tone: "emerald" | "amber" | "rose" }) {
  const dot =
    tone === "emerald" ? "bg-emerald-500"
    : tone === "amber" ? "bg-amber-500"
    : "bg-rose-500";
  const hover =
    tone === "emerald" ? "hover:border-emerald-500/60"
    : tone === "amber" ? "hover:border-amber-500/60"
    : "hover:border-rose-500/60";
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:bg-zinc-900 ${hover}`}
    >
      <span className="flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full ${dot} shadow-[0_0_8px_currentColor]`} aria-hidden />
        <span className="text-sm font-bold text-zinc-100">{tier}</span>
        <span className="text-xs text-zinc-300">— {name}</span>
      </span>
      <svg className="h-4 w-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}