import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LobbyChrome } from "@/components/LobbyChrome";
import { supabase } from "@/integrations/supabase/client";
import { getStoredIdentity } from "@/lib/identity";
import {
  fetchGamesToday,
  fetchLeaderboard,
  fetchLiveRooms,
  fetchMyWinStreak,
  fetchQueueCount,
  fetchRecentMatches,
  type LeaderRow,
  type LiveRoom,
  type RecentMatchRow,
} from "@/lib/stats";

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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Is Quoridor free to play online?",
              acceptedAnswer: { "@type": "Answer", text: "Yes. Play Quoridor free in your browser — no download, no signup. Quick match, ranked, private rooms, 4-player free-for-alls and bot practice are all included." },
            },
            {
              "@type": "Question",
              name: "How do you play Quoridor?",
              acceptedAnswer: { "@type": "Answer", text: "On your turn either move your pawn one square (orthogonally) or place one of your walls to block an opponent. Walls cannot fully seal any player off from their goal row. First pawn to reach the opposite side wins." },
            },
            {
              "@type": "Question",
              name: "How many walls does each player get?",
              acceptedAnswer: { "@type": "Answer", text: "In a 2-player game each side gets 10 walls. In a 4-player game each player gets 5 walls." },
            },
            {
              "@type": "Question",
              name: "Can I play Quoridor against a computer?",
              acceptedAnswer: { "@type": "Answer", text: "Yes. Choose CPU Practice from the lobby and pick Easy, Medium or Hard to play solo against a bot." },
            },
            {
              "@type": "Question",
              name: "Can I play Quoridor with a friend?",
              acceptedAnswer: { "@type": "Answer", text: "Yes. Create a private room and share the 5-character code, or enter a friend's code from the lobby to join their game." },
            },
          ],
        }),
      },
    ],
  }),
  component: Lobby,
});

type Mode = "2p" | "4p" | "ranked";

function computeOnline(real: number): number {
  const t = Date.now() / 60000;
  const wave = (Math.sin(t / 3.1) + Math.sin(t / 1.7 + 1.3)) / 2;
  const base = 175 + Math.round(wave * 22);
  const jitter = Math.floor(Math.random() * 5);
  return Math.max(150, Math.min(260, base + jitter + real));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const ACTIVE_GAME_KEY = "quoridor:activeGame";
const ACTIVE_GAME_TTL_MS = 2 * 60 * 60 * 1000;

function hasActiveGame(): boolean {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw) as { savedAt?: number };
    return typeof p?.savedAt === "number" && Date.now() - p.savedAt < ACTIVE_GAME_TTL_MS;
  } catch { return false; }
}

function Lobby() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("ranked");
  const [code, setCode] = useState("");

  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [live, setLive] = useState<LiveRoom[] | null>(null);
  const [recent, setRecent] = useState<RecentMatchRow[] | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [gamesToday, setGamesToday] = useState<number>(0);
  const [inQueue, setInQueue] = useState<number>(0);
  const [online, setOnline] = useState<number>(180);
  const [signedIn, setSignedIn] = useState<boolean>(false);
  const cleanCode = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5),
    [code],
  );

  useEffect(() => {
    let alive = true;
    void fetchLeaderboard(5).then((r) => alive && setBoard(r)).catch(() => alive && setBoard([]));
    void fetchLiveRooms(5).then((r) => alive && setLive(r)).catch(() => alive && setLive([]));
    void fetchGamesToday().then((n) => alive && setGamesToday(n)).catch(() => {});
    void fetchQueueCount().then((n) => alive && setInQueue(n)).catch(() => {});
    void (async () => {
      // Match rows are keyed by player id. A user can have matches attached to
      // the local player before/without a completed profile, so always include
      // the browser's current player id before falling back to account rows.
      const localPlayerId = getStoredIdentity()?.id ?? null;
      const { data: auth } = await supabase.auth.getSession();
      const u = auth.session?.user ?? null;
      const anon = !u || u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
      if (!alive) return;
      setSignedIn(!!u && !anon);
      const playerIds = localPlayerId ? [localPlayerId] : [];
      if (u && !anon) {
        const { data: accountPlayers } = await supabase
          .from("players").select("id")
          .eq("auth_user_id", u.id)
          .order("created_at", { ascending: false })
          .limit(5);
        for (const p of accountPlayers ?? []) if (!playerIds.includes(p.id)) playerIds.push(p.id);
      }
      if (!alive) return;
      if (playerIds.length === 0) { setRecent([]); return; }
      const [lists, st] = await Promise.all([
        Promise.all(playerIds.map((id) => fetchRecentMatches(id, 4).catch(() => []))),
        fetchMyWinStreak(playerIds[0]!).catch(() => 0),
      ]);
      if (!alive) return;
      const seen = new Set<string>();
      const merged = lists.flat()
        .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
        .filter((m) => {
          if (seen.has(m.matchId)) return false;
          seen.add(m.matchId);
          return true;
        })
        .slice(0, 4);
      setRecent(merged); setStreak(st);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setOnline(computeOnline(board?.length ?? 0));
    const drift = setInterval(() => setOnline(computeOnline(board?.length ?? 0)), 6000);
    const poll = setInterval(() => {
      void fetchLiveRooms(5).then(setLive).catch(() => {});
      void fetchQueueCount().then(setInQueue).catch(() => {});
      void fetchGamesToday().then(setGamesToday).catch(() => {});
    }, 10000);
    return () => { clearInterval(drift); clearInterval(poll); };
  }, [board]);

  const go = useCallback((pending: string) => {
    try { sessionStorage.setItem("quoridor:pendingAction", pending); } catch {/* noop */}
    void navigate({ to: "/game" });
  }, [navigate]);

  function onPlay() {
    // Never let a player start a second game while one is still active —
    // send them to the resume prompt instead.
    if (hasActiveGame()) { void navigate({ to: "/game" }); return; }
    if (mode === "ranked" && !signedIn) {
      void navigate({ to: "/auth" });
      return;
    }
    if (mode === "2p") go("quick2");
    else if (mode === "4p") go("quick4");
    else go("ranked2");
  }
  function onJoin(c: string) {
    if (c.length !== 5) return;
    if (hasActiveGame()) { void navigate({ to: "/game" }); return; }
    try { sessionStorage.setItem("quoridor:pendingJoin", c); } catch {/* noop */}
    void navigate({ to: "/game" });
  }
  function onSpectate(c: string) {
    try { sessionStorage.setItem("quoridor:pendingAction", `spectate:${c}`); } catch {/* noop */}
    void navigate({ to: "/game" });
  }

  const queueLabel =
    mode === "ranked" && !signedIn ? "SIGN IN TO PLAY RANKED" :
    mode === "2p" ? "FIND CASUAL MATCH" :
    mode === "4p" ? "FIND 4-PLAYER MATCH" :
    "QUEUE FOR RANKED";

  return (
    <LobbyChrome online={online}>
      {/* Hero */}
      <section className="relative overflow-hidden px-8 py-[60px] text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(#191920 1px,transparent 1px),linear-gradient(90deg,#191920 1px,transparent 1px)",
            backgroundSize: "48px 48px",
            WebkitMaskImage: "radial-gradient(ellipse 52% 68% at 50% 32%,#000 15%,transparent 72%)",
            maskImage: "radial-gradient(ellipse 52% 68% at 50% 32%,#000 15%,transparent 72%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[16%] h-[340px] w-[620px] -translate-x-1/2"
          style={{ background: "radial-gradient(closest-side,rgba(245,165,36,0.14),transparent 68%)", opacity: 0.6 }}
        />
        <h1 className="relative m-0 text-[50px] font-bold leading-none tracking-[-0.035em] sm:text-[66px]">
          Play <span className="text-[#f5a524]">Quoridor</span>
        </h1>
        <div className="relative">
          <button
            onClick={onPlay}
            onClick={() => {
              if (hasActiveGame()) { void navigate({ to: "/game" }); return; }
              go("quick2");
            }}
            className="mt-10 inline-flex items-center gap-3 rounded-[10px] border border-[rgba(47,213,117,0.6)] bg-gradient-to-b from-[#2bcb6f] to-[#1fb35f] px-[46px] py-4 text-[15.5px] font-bold uppercase tracking-[0.08em] text-[#04150b] transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: "0 4px 26px rgba(47,213,117,.2),inset 0 1px 0 rgba(255,255,255,.2)" }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
              <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
            </svg>
            Play Now
          </button>
        </div>
        <div className="relative mt-4 text-[12px] text-[#83838e]">
          Free — no account needed
        </div>
        <div className="relative mt-4 flex items-center justify-center gap-3 text-[11.5px] text-[#83838e]">
          <span className="inline-flex items-center gap-2">
            <span className="h-[7px] w-[7px] rounded-full bg-[#2fd575] shadow-[0_0_8px_#2fd575]" />
            Matchmaking online
          </span>
          <span className="text-[#3d3d46]">·</span>
          <span className="font-[IBM_Plex_Mono,monospace]">{online} players online</span>
          {inQueue > 0 && (
            <>
              <span className="text-[#3d3d46]">·</span>
              <span className="font-[IBM_Plex_Mono,monospace]">{inQueue} in queue</span>
            </>
          )}
          {gamesToday > 0 && (
            <>
              <span className="hidden text-[#3d3d46] sm:inline">·</span>
              <span className="hidden font-[IBM_Plex_Mono,monospace] sm:inline">{gamesToday.toLocaleString()} games today</span>
            </>
          )}
        </div>
      </section>

      {/* Main grid */}
      <div id="play" className="mx-auto grid max-w-[1240px] items-start gap-5 px-8 pb-6 lg:grid-cols-[280px_1fr_300px]">
        {/* Left column */}
        <div className="hidden flex-col gap-4 lg:flex">
          <Card>
            <CardHeader eyebrow="🏆 Leaderboard" action={<Link to="/stats" className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#f5a524] hover:text-[#ffc45e]">View all</Link>} />
            <div className="mt-3">
              {board === null && Array.from({ length: 5 }).map((_, i) => (
                <Row key={i}><span className="h-3 w-24 animate-pulse rounded bg-[#1e1e24]" /></Row>
              ))}
              {board?.length === 0 && (
                <div className="border-t border-[#1a1a1f] px-5 py-4 text-[12.5px] text-[#83838e]">
                  No ranked matches yet. Be the first.
                </div>
              )}
              {board?.map((p, i) => (
                <Row key={p.id}>
                  <span className={"w-[22px] font-[IBM_Plex_Mono,monospace] text-[12px] " + (i === 0 ? "text-[#f5a524]" : "text-[#5c5c66]")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate text-[13.5px] font-semibold">{p.name}</span>
                  <span className="font-[IBM_Plex_Mono,monospace] text-[12.5px] text-[#83838e]">{p.rating}</span>
                </Row>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Recent matches"
              action={recent && recent.length > 0 ? (
                <Link to="/history" className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#f5a524] hover:text-[#ffc45e]">History</Link>
              ) : null}
            />
            <div className="mt-3">
              {recent === null && Array.from({ length: 3 }).map((_, i) => (
                <Row key={i}>
                  <span className="h-[26px] w-[26px] animate-pulse rounded-lg bg-[#1e1e24]" />
                  <span className="h-3 w-24 animate-pulse rounded bg-[#1e1e24]" />
                </Row>
              ))}
              {recent?.length === 0 && (
                <div className="border-t border-[#1a1a1f] px-5 py-4 text-[12.5px] text-[#83838e]">
                  No recent matches yet.
                </div>
              )}
              {recent?.map((m) => {
                const win = m.result === "win";
                return (
                  <Row key={m.matchId}>
                    <span className={"grid h-[26px] w-[26px] place-items-center rounded-lg font-[IBM_Plex_Mono,monospace] text-[11.5px] font-bold " + (win ? "bg-[rgba(47,213,117,0.12)] text-[#2fd575]" : "bg-[rgba(255,92,92,0.1)] text-[#ff7a7a]")}>
                      {win ? "W" : "L"}
                    </span>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">vs {m.opponentName}</div>
                      <div className="text-[11px] text-[#5c5c66]">{m.ranked ? "Ranked" : "Casual"} · {m.mode}p</div>
                    </div>
                    <span className="font-[IBM_Plex_Mono,monospace] text-[11px] text-[#5c5c66]">{timeAgo(m.endedAt)}</span>
                  </Row>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Middle: Live Lobby */}
        <Card className="pb-5">
          <div className="flex items-center justify-between px-6 pt-5">
            <span className="text-[16px] font-bold">Live Lobby</span>
            <span className="flex items-center gap-2">
              <span className="h-[7px] w-[7px] rounded-full bg-[#2fd575] shadow-[0_0_8px_#2fd575]" />
              <span className="text-[11px] font-semibold tracking-[0.12em] text-[#2fd575]">CONNECTED</span>
            </span>
          </div>
          <div className="px-6 pt-4">
            <Eyebrow>Find match</Eyebrow>
            <div className="mt-3 flex gap-3">
              {([
                { id: "2p", title: "2 Players", sub: "Casual" },
                { id: "4p", title: "4 Players", sub: "Free-for-all" },
                { id: "ranked", title: "Ranked", sub: "ELO 1v1" },
              ] as { id: Mode; title: string; sub: string }[]).map((m) => {
                const on = mode === m.id;
                const locked = m.id === "ranked" && !signedIn;
                return (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={"relative flex-1 rounded-[12px] border p-4 text-left transition-colors " +
                      (on
                        ? "border-[rgba(245,165,36,0.35)] bg-[rgba(245,165,36,0.14)] shadow-[0_0_24px_rgba(245,165,36,0.14)]"
                        : "border-[#232329] bg-[#17171b] hover:border-[#34343e]")}>
                    <div className="text-[16px] font-bold">{m.title}</div>
                    <div className={"mt-[5px] text-[10.5px] font-semibold uppercase tracking-[0.13em] " + (on ? "text-[#f5a524]" : "text-[#5c5c66]")}>
                      {m.sub}
                    </div>
                    {locked && (
                      <span
                        title="Sign in to play ranked"
                        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-[#3a3a44]/70 bg-[#0d0d10]/60 px-1.5 py-[2px] font-[IBM_Plex_Mono,monospace] text-[9px] font-semibold uppercase tracking-[0.14em] text-[#a4a4b0]/80 backdrop-blur-[2px]"
                      >
                        <svg width="8" height="9" viewBox="0 0 10 12" aria-hidden fill="none">
                          <path d="M2 5V3.5a3 3 0 016 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <rect x="1.2" y="5" width="7.6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                        Locked
                      </span>
                    )}
                    {m.id === "4p" && (
                      <span
                        title="Free-for-all mayhem"
                        className="chaos-badge absolute -right-2 -top-2 inline-flex items-center gap-1 rounded-full border border-fuchsia-400/60 bg-linear-to-r from-fuchsia-600 via-rose-500 to-amber-400 px-2 py-[3px] font-[IBM_Plex_Mono,monospace] text-[9px] font-black uppercase tracking-[0.18em] text-white shadow-[0_4px_14px_rgba(217,70,239,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
                      >
                        <span aria-hidden>⚡</span>
                        Chaos
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button onClick={onPlay}
              className="mt-4 w-full rounded-[11px] bg-[#f5a524] px-4 py-[14px] text-[14.5px] font-bold tracking-[0.02em] text-[#160e00] transition-[filter] hover:brightness-110">
              {queueLabel}
            </button>
          </div>
          <div className="px-6 pt-6">
            <Eyebrow>Play with friends</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-[10px]">
              <button onClick={() => go("create")}
                className="whitespace-nowrap rounded-[10px] border border-[#2b2b33] bg-[#1e1e24] px-[18px] py-3 text-[12.5px] font-bold uppercase tracking-[0.06em] hover:bg-[#26262e]">
                + Create Room
              </button>
              <form onSubmit={(e) => { e.preventDefault(); onJoin(cleanCode); }} className="flex flex-1 gap-[10px]">
                <input value={cleanCode} onChange={(e) => setCode(e.target.value)} placeholder="Enter room code…" maxLength={5}
                  className="min-w-0 flex-1 rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-3 font-[IBM_Plex_Mono,monospace] text-[13px] tracking-[0.3em] text-[#ececf1] outline-none placeholder:tracking-normal placeholder:text-[#5c5c66] focus:border-[rgba(245,165,36,0.35)]" />
                <button type="submit" disabled={cleanCode.length !== 5}
                  className="rounded-[10px] border border-[#2b2b33] bg-[#17171b] px-[22px] py-3 text-[12.5px] font-bold uppercase tracking-[0.08em] hover:border-[rgba(245,165,36,0.35)] hover:text-[#f5a524] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#2b2b33] disabled:hover:text-[#ececf1]">
                  Join
                </button>
              </form>
            </div>
          </div>
          <div className="pt-6">
            <div className="flex items-center justify-between px-6">
              <Eyebrow>
                <span className="mr-2 inline-block h-[6px] w-[6px] rounded-full bg-[#ff5c5c] shadow-[0_0_6px_#ff5c5c] align-middle" />
                Live games — spectate
              </Eyebrow>
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#f5a524]">All tables</span>
            </div>
            <div className="mt-2">
              {live === null && Array.from({ length: 3 }).map((_, i) => (
                <Row key={i}><span className="h-3 w-40 animate-pulse rounded bg-[#1e1e24]" /></Row>
              ))}
              {live?.length === 0 && (
                <div className="border-t border-[#1a1a1f] px-6 py-5 text-[12.5px] text-[#83838e]">
                  No live games right now. Host one to get the party going.
                </div>
              )}
              {live?.map((g) => (
                <button key={g.code} onClick={() => onSpectate(g.code)}
                  className="flex w-full items-center gap-3 border-t border-[#1a1a1f] px-6 py-[11px] text-left transition-colors hover:bg-[#15151a]">
                  <div className="flex-1 truncate">
                    <span className="text-[13px] font-semibold">{g.hostName}</span>
                    <span className="text-[12px] text-[#5c5c66]"> · {g.mode}p {g.ranked ? "Ranked" : "Casual"}</span>
                  </div>
                  <span className="font-[IBM_Plex_Mono,monospace] text-[11px] text-[#5c5c66]">{g.seatsTaken}/{g.seatsTotal}</span>
                  <span className="font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-widest text-[#83838e]">{g.code}</span>
                  <span className="text-[16px] text-[#3d3d46]">›</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">Quick play</div>
          <Card>
            <CardHeader eyebrow="CPU Practice" action={<span className="text-[11px] text-[#5c5c66]">choose difficulty</span>} />
            <div className="mt-3">
              <CpuRow onClick={() => go("cpu:easy")} color="#2fd575" lvl="Easy" name="Tom" desc="Learns the ropes with you" />
              <CpuRow onClick={() => go("cpu:medium")} color="#f5a524" lvl="Medium" name="Jackeline" desc="Punishes lazy walls" />
              <CpuRow onClick={() => go("cpu:hard")} color="#ff5c7a" lvl="Hard" name="Rachel" desc="Near-perfect pathing" />
            </div>
          </Card>

          <Link to="/puzzle"
            className="block rounded-2xl border border-[#232329] bg-[#111114] p-5 transition-colors hover:border-[rgba(245,165,36,0.35)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">🧩 Daily puzzle</span>
              {streak > 0 && (
                <span className="rounded-md bg-[rgba(245,165,36,0.14)] px-2 py-[3px] font-[IBM_Plex_Mono,monospace] text-[11.5px] text-[#f5a524]">
                  🔥 {streak} win streak
                </span>
              )}
            </div>
            <div className="mt-3 text-[15px] font-bold">Today's board</div>
            <div className="mt-1 text-[12px] text-[#83838e]">Today's position</div>
            <div className="mt-3 text-[12px] font-semibold text-[#f5a524]">SOLVE TODAY'S →</div>
          </Link>
        </div>
      </div>

      <SeoFaq />
    </LobbyChrome>
  );
}

function SeoFaq() {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "What is Quoridor?",
      a: (
        <>Quoridor is a two- or four-player abstract strategy board game on a 9×9 grid. On your turn you either move your pawn one square or place a wall to slow your opponents. First pawn to reach the opposite side wins.</>
      ),
    },
    {
      q: "How do you play Quoridor online?",
      a: (
        <>Hit <strong>Play Now</strong>, pick 2-player casual, 4-player free-for-all or ranked 1v1, and you're matched in seconds. No download and no account needed to start.</>
      ),
    },
    {
      q: "What are the full rules?",
      a: (
        <>Each player starts with a pawn on their baseline. On your turn move one square orthogonally <em>or</em> place a wall between squares. Walls are two squares long and can't cross another wall or completely block any player from reaching their goal row. Pawns facing each other may jump; if the square behind is blocked, you may step diagonally. 2-player games use 10 walls per side, 4-player games use 5 walls per player.</>
      ),
    },
    {
      q: "Can I play against a computer or a friend?",
      a: (
        <>Yes — pick a CPU opponent (Easy, Medium or Hard) from the lobby, or create a private room and share the 5-letter code with a friend to play online together.</>
      ),
    },
    {
      q: "Is Quoridor really free — no signup, no download?",
      a: (
        <>Yes. Everything runs in the browser. Optional sign-in unlocks ranked ELO, stats and friends, but you can jump into a casual match without an account.</>
      ),
    },
  ];
  return (
    <section aria-labelledby="faq-heading" className="mx-auto mt-32 max-w-2xl px-8 pb-16 text-[12.5px] text-muted-foreground/80">
      <h2 id="faq-heading" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">
        Quoridor — frequently asked questions
      </h2>
      <div className="mt-4 divide-y divide-border/30 border-y border-border/30">
        {items.map((it) => (
          <details key={it.q} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] font-medium text-[#c9c9d1] marker:hidden [&::-webkit-details-marker]:hidden">
              <span>{it.q}</span>
              <span className="text-[10px] text-[#5c5c66] transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-2 leading-relaxed">{it.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"rounded-2xl border border-[#232329] bg-[#111114] " + className}>{children}</div>;
}
function CardHeader({ eyebrow, action }: { eyebrow: React.ReactNode; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between px-5 pt-4"><Eyebrow>{eyebrow}</Eyebrow>{action}</div>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">{children}</span>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-t border-[#1a1a1f] px-5 py-[11px]">{children}</div>;
}
function CpuRow({ onClick, color, lvl, name, desc }: { onClick: () => void; color: string; lvl: string; name: string; desc: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-t border-[#1a1a1f] px-5 py-[11px] text-left transition-colors hover:bg-[#15151a]">
      <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <div className="flex-1">
        <div className="text-[13px] font-bold">{lvl} <span className="font-medium text-[#83838e]">— {name}</span></div>
        <div className="text-[11px] text-[#5c5c66]">{desc}</div>
      </div>
      <span className="text-[16px] text-[#3d3d46]">›</span>
    </button>
  );
}