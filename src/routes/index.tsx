import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PLAYER_COLORS, QuoridorBoard } from "@/components/QuoridorBoard";
import {
  applyForfeit, applyMove, defaultWallsFor, initialState, newRound, winsNeeded,
  type GameState, type Mode, type Move, type PlayerId,
} from "@/lib/quoridor";
import {
  createGuestRoom, createHostRoom, makeRoomCode,
  type PeerMessage, type Room, type RosterEntry,
} from "@/lib/peer-room";
import {
  getStoredIdentity, isValidName, sanitizeName, setStoredIdentity, type Identity,
} from "@/lib/identity";
import {
  bumpMyStats, fetchMyStats, findOpenRoom, recordMatch,
  registerOpenRoom, removeOpenRoom, updateOpenRoomSeats,
} from "@/lib/stats";
import {
  getVolume, initSoundOnGesture, isMuted, play, setMuted, setVolume,
} from "@/lib/sound";
import { humanThinkTimeMs, pickBotMove, randomDifficulty } from "@/lib/bot";
import { randomGamerName } from "@/lib/names";
import {
  DEFAULT_CLOCK_MS, endTurn, formatClock, initClocks, liveRemaining,
  type ClockState,
} from "@/lib/clock";

const SEO_TITLE = "Play Quoridor Online Free – Wall Blocking Strategy Game";
const SEO_DESCRIPTION =
  "Play Quoridor online for free! The classic strategy game where you move your piece and place walls to block your opponent. No download needed. Also known as the 'balls and walls game' or 'wall blocking puzzle game'.";
const SEO_OG_DESCRIPTION =
  "Move your piece, place walls, block your opponent. Free online Quoridor — the addictive strategy game anyone can learn in 2 minutes.";
const SEO_KEYWORDS =
  "quoridor online, play quoridor, quoridor game free, wall blocking game, balls and walls game, block opponent with walls game, wall placement strategy game, pawn and walls board game, maze blocking game online, grid wall game, place walls to win game, quoridor multiplayer";
const SITE_URL = "https://playquoridor.online";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: SEO_TITLE },
      { name: "description", content: SEO_DESCRIPTION },
      { name: "keywords", content: SEO_KEYWORDS },
      { property: "og:title", content: SEO_TITLE },
      { property: "og:description", content: SEO_OG_DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SEO_TITLE },
      { name: "twitter:description", content: SEO_OG_DESCRIPTION },
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
          description:
            "Free online Quoridor game. Move your pawn and place walls to block your opponent from reaching the other side. Strategy board game playable in browser.",
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
              name: "What is the game where you place walls to block your opponent?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "It's called Quoridor — a two- or four-player strategy board game where each player moves a pawn across a 9×9 grid while placing walls (fences) to slow the opponent down. First pawn to reach the opposite side wins.",
              },
            },
            {
              "@type": "Question",
              name: "What is the balls and walls game called?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "The board game people describe as 'balls and walls' — round pawns you push forward while dropping wall segments to block the other player — is Quoridor. You can play it free in your browser at playquoridor.online.",
              },
            },
            {
              "@type": "Question",
              name: "How do you play the wall blocking board game?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "On your turn you either move your pawn one square (up, down, left, or right) or place one of your walls between two rows or columns to block a path. Walls cannot completely trap the opponent — they must always have a route to their goal edge. First player to reach the opposite side wins.",
              },
            },
          ],
        }),
      },
    ],
  }),
});

type View =
  | { name: "menu" }
  | { name: "create"; mode: Mode; walls: number; rounds: number }
  | { name: "join" }
  | { name: "quick"; mode: Mode }
  | { name: "game"; isHost: boolean; code: string; mode: Mode; walls: number; rounds: number; quickMatch?: boolean }
  | { name: "bot"; difficulty: number; opponentName: string }
  | { name: "spectate" }
  | { name: "spectating"; code: string };

function Home() {
  const [ident, setIdent] = useState<Identity | null>(null);
  const [view, setView] = useState<View>({ name: "menu" });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setIdent(getStoredIdentity());
  }, []);

  const onSetName = (name: string) => {
    const i = setStoredIdentity(name);
    setIdent(i);
  };

  return (
    <main className="min-h-screen" onPointerDown={() => initSoundOnGesture()}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-3 py-4 sm:px-6 sm:py-10">
        <Header onOpenSettings={() => setSettingsOpen(true)} ident={ident} />

        {!ident ? (
          <div className="flex flex-1 items-center justify-center py-4 sm:py-6">
            <NamePrompt onSubmit={onSetName} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-4 sm:py-6">
            {view.name === "menu" && (
              <Menu ident={ident} onChoose={setView} onEditName={() => setIdent(null)} />
            )}
            {view.name === "create" && (
              <CreateRoom
                mode={view.mode} walls={view.walls} rounds={view.rounds}
                setMode={(m) => setView({ ...view, mode: m, walls: defaultWallsFor(m) })}
                setWalls={(w) => setView({ ...view, walls: w })}
                setRounds={(r) => setView({ ...view, rounds: r })}
                onBack={() => setView({ name: "menu" })}
                onStart={(code) => setView({ name: "game", isHost: true, code, mode: view.mode, walls: view.walls, rounds: view.rounds })}
              />
            )}
            {view.name === "join" && (
              <JoinRoom
                onBack={() => setView({ name: "menu" })}
                onJoin={(code) => setView({ name: "game", isHost: false, code, mode: 2, walls: 10, rounds: 5 })}
              />
            )}
            {view.name === "spectate" && (
              <SpectateRoom
                onBack={() => setView({ name: "menu" })}
                onJoin={(code) => setView({ name: "spectating", code })}
              />
            )}
            {view.name === "spectating" && (
              <SpectatorGame
                key={"spec-" + view.code}
                ident={ident}
                code={view.code}
                onLeave={() => setView({ name: "menu" })}
              />
            )}
            {view.name === "quick" && (
              <QuickMatch
                mode={view.mode}
                ident={ident}
                onBack={() => setView({ name: "menu" })}
                onJoin={(code) => setView({ name: "game", isHost: false, code, mode: view.mode, walls: defaultWallsFor(view.mode), rounds: 5 })}
                onHost={(code) => setView({ name: "game", isHost: true, code, mode: view.mode, walls: defaultWallsFor(view.mode), rounds: 5, quickMatch: true })}
              />
            )}
            {view.name === "game" && (
              <GameScreen
                key={view.code + (view.isHost ? "-h" : "-g")}
                ident={ident}
                code={view.code}
                isHost={view.isHost}
                mode={view.mode}
                initialWalls={view.walls}
                initialRounds={view.rounds}
                quickMatch={view.quickMatch}
                onBotFallback={() => setView({
                  name: "bot",
                  difficulty: randomDifficulty().value,
                  opponentName: randomGamerName(),
                })}
                onLeave={() => setView({ name: "menu" })}
              />
            )}
            {view.name === "bot" && (
              <BotGame
                ident={ident}
                difficulty={view.difficulty}
                opponentName={view.opponentName}
                onLeave={() => setView({ name: "menu" })}
              />
            )}
          </div>
        )}

        <SeoContent />
        <Footer />
      </div>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function Header({ ident, onOpenSettings }: { ident: Identity | null; onOpenSettings: () => void }) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <img
          src="/favicon.png"
          alt="Play Quoridor free in browser — place walls to block opponent"
          width={40}
          height={40}
          className="h-9 w-9 shrink-0 rounded-md sm:h-10 sm:w-10"
          style={{ boxShadow: "0 6px 14px -6px oklch(0 0 0 / 0.6)" }}
        />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-none sm:text-xl">playquoridor.online</p>
          <p className="mt-1 hidden text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:block">
            Peer to peer · 2 or 4 players
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {ident && <WinsBadge playerId={ident.id} />}
        <Link to="/stats" className="rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] uppercase tracking-widest hover:bg-secondary sm:px-3">
          Stats
        </Link>
        <button onClick={onOpenSettings} aria-label="Settings" className="rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] uppercase tracking-widest hover:bg-secondary sm:px-3">
          <span className="hidden sm:inline">Settings</span>
          <span className="sm:hidden" aria-hidden>⚙</span>
        </button>
      </div>
    </header>
  );
}

function WinsBadge({ playerId }: { playerId: string }) {
  const [wins, setWins] = useState<number | null>(null);
  useEffect(() => { void fetchMyStats(playerId).then((s) => setWins(s?.wins ?? 0)); }, [playerId]);
  if (wins === null) return null;
  return (
    <span className="hidden rounded-md border border-border bg-card px-2.5 py-1 text-[10px] uppercase tracking-widest sm:inline-flex">
      <span className="text-muted-foreground">Wins</span>
      <span className="ml-1.5 font-semibold text-primary">{wins}</span>
    </span>
  );
}

function Footer() {
  return (
    <footer className="pt-6 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
      Peer-to-peer · no accounts · your browser only
    </footer>
  );
}

function SeoContent() {
  return (
    <section
      aria-labelledby="seo-heading"
      className="mx-auto mt-16 max-w-2xl space-y-3 border-t border-border/40 pt-8 text-xs leading-relaxed text-muted-foreground/80 sm:mt-32"
    >
      <h1 id="seo-heading" className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
        Play Quoridor Online — Free Wall Blocking Strategy Game
      </h1>

      <SeoDetails summary="What is Quoridor?">
        <p>
          <strong className="text-foreground/80">Quoridor</strong> is the strategy game where you
          move your pawn across the board while placing walls to block your opponent. Sometimes
          called the "balls and walls game", the "wall blocking game", or "the game where you
          block with fences" — 2 minutes to learn, years to master. Free in your browser, no
          download.
        </p>
      </SeoDetails>

      <SeoDetails summary="How to play the wall blocking game">
        <p>
          Each turn you do one of two things: move your pawn one square, or drop a wall to slow
          the other player down. Walls can never fully trap an opponent — they must always have a
          legal route to their goal edge. First pawn to touch the opposite side of the 9×9 board
          wins the round.
        </p>
      </SeoDetails>

      <SeoDetails summary="Full Quoridor rules">
        <ul className="list-disc space-y-1 pl-5">
          <li>2-player games start with 10 walls each; 4-player games start with 5 walls each.</li>
          <li>On your turn, either move one square or place a two-square wall between rows or columns.</li>
          <li>If an opponent's pawn is directly next to yours, you may jump over them to the square behind. If a wall or the board edge blocks that square, you may instead step diagonally to either square beside the opponent.</li>
          <li>Walls may never completely block a player from reaching their goal side.</li>
          <li>First pawn to reach the opposite edge of the board wins.</li>
        </ul>
      </SeoDetails>

      <SeoDetails summary="Play online vs a friend">
        <p>
          Create a private room and share the code, jump into Quick Match to be paired with the
          next available player, or set up a 4-player free-for-all. Everything runs peer-to-peer
          in your browser — no downloads, no accounts, just a room code.
        </p>
      </SeoDetails>

      <SeoDetails summary="What is the game where you place walls to block your opponent?">
        <p>
          It's called Quoridor — a two- or four-player strategy board game where each player moves
          a pawn across a 9×9 grid while placing walls (fences) to slow the opponent down. First
          pawn to reach the opposite side wins.
        </p>
      </SeoDetails>

      <SeoDetails summary="What is the balls and walls game called?">
        <p>
          The board game people describe as "balls and walls" — round pawns you push forward while
          dropping wall segments to block the other player — is Quoridor. Play it free in your
          browser here at playquoridor.online.
        </p>
      </SeoDetails>

      <SeoDetails summary="How do you play the wall blocking board game?">
        <p>
          On your turn you either move your pawn one square, or place one of your walls between
          two rows or columns to block a path. Walls cannot completely trap the opponent — they
          must always have a route to their goal edge. First player to reach the opposite side
          wins.
        </p>
      </SeoDetails>
    </section>
  );
}

function SeoDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border/30 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs text-muted-foreground hover:text-foreground">
        <span>{summary}</span>
        <span className="text-[10px] opacity-50 transition-transform group-open:rotate-180">▼</span>
      </summary>
      <div className="mt-2 pb-1 text-xs text-muted-foreground/80">{children}</div>
    </details>
  );
}

function NamePrompt({ onSubmit, initial = "" }: { onSubmit: (n: string) => void; initial?: string }) {
  const [name, setName] = useState(initial);
  const clean = sanitizeName(name);
  const ok = isValidName(name);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
      <h1 className="text-3xl">What should we call you?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your display name shows up in the lobby, on the board, and on the leaderboard.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={16}
        autoFocus
        placeholder="Chico"
        className="mt-6 w-full rounded-lg border border-border bg-background/40 px-4 py-3 text-lg focus:border-primary focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{clean.length}/16 · 2–16 characters</p>
      <button
        disabled={!ok}
        onClick={() => ok && onSubmit(name)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Continue →
      </button>
    </div>
  );
}

function Menu({ ident, onChoose, onEditName }: {
  ident: Identity;
  onChoose: (v: View) => void;
  onEditName: () => void;
}) {
  const [quickMode, setQuickMode] = useState<Mode>(2);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
      <h1 className="text-4xl">A quiet game of Quoridor.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Playing as <span className="font-semibold text-foreground">{ident.name}</span>{" "}
        <button onClick={onEditName} className="text-primary underline underline-offset-2">edit</button>
      </p>

      <div className="mt-6 rounded-lg border border-dashed border-border bg-background/40 p-3">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Quick Match</p>
        <div className="mt-2 flex gap-2">
          {[2, 4].map((m) => (
            <button key={m} onClick={() => setQuickMode(m as Mode)}
              className={"flex-1 rounded-md border px-2 py-1.5 text-xs font-medium " +
                (quickMode === m ? "border-primary bg-primary/10" : "border-border bg-secondary/30 text-muted-foreground")}>
              {m}p
            </button>
          ))}
        </div>
        <button
          onClick={() => { play("click"); onChoose({ name: "quick", mode: quickMode }); }}
          className="mt-3 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Find a match →
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={() => { play("click"); onChoose({ name: "create", mode: 2, walls: 10, rounds: 5 }); }}
          className="rounded-lg border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          Create a private room
        </button>
        <button
          onClick={() => { play("click"); onChoose({ name: "join" }); }}
          className="rounded-lg border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          Join with code
        </button>
      </div>
    </div>
  );
}

function CreateRoom({ mode, walls, rounds, setMode, setWalls, setRounds, onBack, onStart }: {
  mode: Mode; walls: number; rounds: number;
  setMode: (m: Mode) => void; setWalls: (n: number) => void; setRounds: (n: number) => void;
  onBack: () => void; onStart: (code: string) => void;
}) {
  const [code] = useState(() => makeRoomCode());
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button onClick={onBack} className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">← Back</button>
      <h2 className="mt-3 text-2xl">Create a room</h2>
      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Players</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[2, 4].map((m) => (
            <button key={m} onClick={() => setMode(m as Mode)}
              className={"rounded-lg border px-4 py-3 text-sm font-medium " +
                (mode === m ? "border-primary bg-primary/10" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground")}>
              {m} Players
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <label className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Walls per player <span className="text-base font-semibold text-foreground">{walls}</span>
        </label>
        <input type="range" min={0} max={20} step={1} value={walls} onChange={(e) => setWalls(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--primary)]" />
      </div>
      <div className="mt-6">
        <label className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Rounds <span className="text-base font-semibold text-foreground">
            {rounds === 1 ? "single game" : `best of ${rounds} · first to ${winsNeeded(rounds)}`}
          </span>
        </label>
        <input type="range" min={1} max={10} step={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--primary)]" />
      </div>
      <div className="mt-6 rounded-lg border border-dashed border-border bg-background/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Room code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-mono text-3xl tracking-[0.3em] text-primary">{code}</p>
          <button onClick={copy} className="rounded-md border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <button onClick={() => onStart(code)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
        Open room →
      </button>
    </div>
  );
}

function JoinRoom({ onBack, onJoin }: { onBack: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button onClick={onBack} className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">← Back</button>
      <h2 className="mt-3 text-2xl">Join a room</h2>
      <input value={clean} onChange={(e) => setCode(e.target.value)} placeholder="K7M2Q" autoFocus
        className="mt-6 w-full rounded-lg border border-border bg-background/40 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] text-primary focus:border-primary focus:outline-none" />
      <button disabled={clean.length !== 5} onClick={() => onJoin(clean)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        Join →
      </button>
    </div>
  );
}

function QuickMatch({ mode, ident, onBack, onJoin, onHost }: {
  mode: Mode; ident: Identity;
  onBack: () => void; onJoin: (code: string) => void; onHost: (code: string) => void;
}) {
  const [status, setStatus] = useState("Searching…");
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    (async () => {
      const existing = await findOpenRoom(mode);
      if (cancelled.current) return;
      if (existing) { setStatus("Joining room…"); onJoin(existing); return; }
      const code = makeRoomCode();
      setStatus("No matches — hosting a new room…");
      await registerOpenRoom(code, mode, ident.name);
      if (cancelled.current) { await removeOpenRoom(code); return; }
      onHost(code);
    })();
    return () => { cancelled.current = true; };
  }, [mode, ident.name, onJoin, onHost]);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl text-center">
      <div className="spinner mx-auto h-12 w-12 rounded-full border-2 border-primary border-t-transparent" />
      <p className="mt-4 text-sm uppercase tracking-[0.25em]">{status}</p>
      <p className="mt-1 text-xs text-muted-foreground">{mode} players</p>
      <button onClick={onBack} className="mt-6 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
        Cancel
      </button>
    </div>
  );
}

// ---------------- GAME ----------------

type Status = "connecting" | "waiting" | "connected" | "disconnected" | "error";

type EventEntry = { key: number; text: string };

type AfkState = { slot: PlayerId; deadline: number } | null;

const AFK_IDLE_MS = 60_000;
const AFK_COUNTDOWN_MS = 90_000;

function GameScreen({
  ident, code, isHost, mode: initialMode, initialWalls, initialRounds, onLeave,
  quickMatch, onBotFallback,
}: {
  ident: Identity; code: string; isHost: boolean; mode: Mode;
  initialWalls: number; initialRounds: number; onLeave: () => void;
  quickMatch?: boolean; onBotFallback?: () => void;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [presence, setPresence] = useState<{ count: number; expected: number }>({ count: 1, expected: initialMode });
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const rosterRef = useRef<RosterEntry[]>(roster);
  rosterRef.current = roster;

  const [slot, setSlot] = useState<PlayerId>(0);
  const slotRef = useRef<PlayerId>(0); slotRef.current = slot;

  const [state, setState] = useState<GameState>(() => initialState(initialMode, initialWalls, initialRounds));
  const stateRef = useRef(state); stateRef.current = state;

  const [coinflip, setCoinflip] = useState<{ starter: PlayerId; animating: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [log, setLog] = useState<EventEntry[]>([]);
  const [afk, setAfk] = useState<AfkState>(null);
  const roomRef = useRef<Room | null>(null);
  const matchRecordedRef = useRef(false);

  const nameOf = useCallback((s: PlayerId): string => {
    const r = rosterRef.current.find((e) => e.slot === s);
    return r?.name ?? `Player ${s + 1}`;
  }, []);

  const pushLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-30), { key: Date.now() + Math.random(), text }]);
  }, []);

  const startCoinflip = useCallback((starter: PlayerId) => {
    setCoinflip({ starter, animating: true });
    play("matchStart");
    window.setTimeout(() => setCoinflip((cf) => (cf ? { ...cf, animating: false } : cf)), 2000);
  }, []);

  const hostStartRound = useCallback((base?: GameState) => {
    const src = base ?? stateRef.current;
    const active = src.leftMatch.map((l) => !l);
    const candidates = active.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const starter = (candidates[Math.floor(Math.random() * candidates.length)] ?? 0) as PlayerId;
    const rawNs = newRound(src, starter);
    // Fresh clocks each round; countdown begins once the coinflip settles.
    const ns: GameState = {
      ...rawNs,
      clocks: {
        remaining: Array.from({ length: rawNs.mode }, () => DEFAULT_CLOCK_MS),
        turnStartedAt: Date.now() + 2000,
        total: DEFAULT_CLOCK_MS,
      },
    };
    setState(ns);
    roomRef.current?.send({ type: "state", payload: ns });
    roomRef.current?.send({ type: "coinflip", payload: { starter } });
    startCoinflip(starter);
  }, [startCoinflip]);

  const hostStartMatch = useCallback(() => {
    matchRecordedRef.current = false;
    const { totalWalls, totalRounds, mode } = stateRef.current;
    hostStartRound(initialState(mode, totalWalls, totalRounds));
  }, [hostStartRound]);

  const hostApplyForfeit = useCallback((who: PlayerId, permanent = false) => {
    const ns = applyForfeit(stateRef.current, who, permanent);
    if (!ns) return;
    setState(ns);
    roomRef.current?.send({ type: "state", payload: ns });
    play("pop");
  }, []);

  // ---------- Connection ----------
  useEffect(() => {
    let cancelled = false;
    const handlers = {
      onOpen: () => { if (!cancelled) setStatus("waiting"); },
      onPresence: (count: number, expected: number, r: RosterEntry[]) => {
        if (cancelled) return;
        setPresence({ count, expected });
        setRoster(r);
        if (isHost) void updateOpenRoomSeats(code, count);
      },
      onAssign: (s: number, m: Mode, expected: number, r: RosterEntry[]) => {
        if (cancelled) return;
        setSlot(s as PlayerId);
        setRoster(r);
        setPresence((p) => ({ count: p.count, expected }));
        setState((prev) => (prev.mode === m ? prev : initialState(m, initialWalls, initialRounds)));
      },
      onGuestJoined: (_s: number, name: string) => { pushLog(`${name} joined`); play("join"); },
      onGuestLeft: (_s: number, name: string) => { pushLog(`${name} left the game`); },
      onFull: () => {
        if (cancelled) return;
        setStatus("connected");
        if (isHost) { void removeOpenRoom(code); hostStartMatch(); }
      },
      onDisconnect: () => { if (!cancelled) setStatus("disconnected"); },
      onMessage: (msg: PeerMessage) => {
        if (cancelled) return;
        if (msg.type === "state") {
          setState(msg.payload as GameState);
          setStatus("connected");
        } else if (msg.type === "move" && isHost) {
          const p = msg.payload as { from: PlayerId; move: Move };
          const next = applyMove(stateRef.current, p.from, p.move);
          if (next) {
            if (stateRef.current.clocks) {
              next.clocks = endTurn(stateRef.current.clocks, p.from, Date.now());
            }
            setState(next);
            roomRef.current?.send({ type: "state", payload: next });
          }
        } else if (msg.type === "forfeit" && isHost) {
          const p = msg.payload as { from: PlayerId };
          pushLog(`${nameOf(p.from)} forfeited the round`);
          hostApplyForfeit(p.from);
        } else if (msg.type === "leave" && isHost) {
          const p = msg.payload as { slot: number };
          hostApplyForfeit(p.slot as PlayerId, true);
        } else if (msg.type === "nextRound" && isHost) {
          if (stateRef.current.matchWinner === null) hostStartRound();
        } else if (msg.type === "newMatch" && isHost) {
          hostStartMatch();
        } else if (msg.type === "coinflip") {
          const p = msg.payload as { starter: number };
          startCoinflip(p.starter as PlayerId);
        } else if (msg.type === "log") {
          pushLog((msg.payload as { text: string }).text);
        } else if (msg.type === "afk") {
          const p = msg.payload as { slot: number; deadline: number };
          setAfk({ slot: p.slot as PlayerId, deadline: p.deadline });
          play("afkWarn");
        } else if (msg.type === "afkCancel") {
          setAfk(null);
        }
      },
      onError: (err: Error) => {
        if (cancelled) return;
        console.error(err);
        const em = err?.message ?? String(err);
        if (em.includes("is taken") || em.includes("unavailable-id"))
          setErrorMsg("That room code is already in use. Try again.");
        else if (em.includes("peer-unavailable"))
          setErrorMsg("No room found with that code.");
        else setErrorMsg(em);
        setStatus("error");
      },
    };
    const boot = async () => {
      try {
        const room = isHost
          ? await createHostRoom(code, initialMode, { name: ident.name, playerId: ident.id }, handlers)
          : await createGuestRoom(code, { name: ident.name, playerId: ident.id }, handlers);
        if (cancelled) { room.close(); return; }
        roomRef.current = room;
        if (isHost) void registerOpenRoom(code, initialMode, ident.name);
      } catch (err) { handlers.onError(err as Error); }
    };
    boot();
    return () => {
      cancelled = true;
      if (isHost) void removeOpenRoom(code);
      roomRef.current?.close();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isHost, initialMode]);

  const you = slot;

  // ---------- Activity + AFK (host authoritative) ----------
  const lastInputRef = useRef<number[]>(Array.from({ length: initialMode }, () => Date.now()));

  // ---------- Quick Match → bot fallback ----------
  // If we hosted via Quick Match and nobody joins within 10s, drop the room
  // and hand off to a local bot game so the player isn't left staring at a
  // spinner. Only fires when we're still waiting for players.
  useEffect(() => {
    if (!quickMatch || !isHost || !onBotFallback) return;
    const t = window.setTimeout(() => {
      if (presenceRef.current.count >= presenceRef.current.expected) return;
      if (stateRef.current.matchWinner !== null) return;
      void removeOpenRoom(code);
      roomRef.current?.close();
      roomRef.current = null;
      onBotFallback();
    }, 10_000);
    return () => window.clearTimeout(t);
  }, [quickMatch, isHost, onBotFallback, code]);
  const markActivity = useCallback((who: PlayerId) => {
    lastInputRef.current[who] = Date.now();
    if (afk && afk.slot === who) {
      setAfk(null);
      if (isHost) roomRef.current?.send({ type: "afkCancel", payload: { slot: who } });
    }
  }, [afk, isHost]);

  useEffect(() => {
    // resize lastInput to mode
    lastInputRef.current = Array.from({ length: state.mode }, (_, i) => lastInputRef.current[i] ?? Date.now());
  }, [state.mode]);

  // Reset idle timestamps whenever the match becomes playable, so time spent
  // waiting in the lobby or watching the coinflip doesn't count as AFK.
  useEffect(() => {
    if (status !== "connected") return;
    if (coinflip?.animating) return;
    const now = Date.now();
    lastInputRef.current = lastInputRef.current.map(() => now);
  }, [status, coinflip?.animating]);

  useEffect(() => {
    if (!isHost) return;
    const iv = window.setInterval(() => {
      const s = stateRef.current;
      if (s.matchWinner !== null || s.winner !== null) return;
      // Don't run the AFK timer while waiting for players or during the coinflip intro.
      if (status !== "connected") return;
      if (coinflip?.animating) return;
      const turn = s.turn;
      if (!s.active[turn]) return;
      const idle = Date.now() - (lastInputRef.current[turn] ?? Date.now());
      if (!afk && idle > AFK_IDLE_MS) {
        const deadline = Date.now() + AFK_COUNTDOWN_MS;
        setAfk({ slot: turn, deadline });
        roomRef.current?.send({ type: "afk", payload: { slot: turn, deadline } });
        pushLog(`${nameOf(turn)} is idle — forfeit countdown started`);
        play("afkWarn");
      } else if (afk && Date.now() > afk.deadline) {
        pushLog(`${nameOf(afk.slot)} timed out and was removed from the match`);
        setAfk(null);
        hostApplyForfeit(afk.slot, true);
      }
    }, 1000);
    return () => window.clearInterval(iv);
  }, [isHost, afk, hostApplyForfeit, pushLog, nameOf, status, coinflip]);

  // ---------- Moves ----------
  // (see handleMove below)
  // Clock enforcement — host authoritative. If the active player runs out
  // of time, they forfeit the round.
  useEffect(() => {
    if (!isHost) return;
    const iv = window.setInterval(() => {
      const s = stateRef.current;
      if (!s.clocks) return;
      if (status !== "connected") return;
      if (coinflip?.animating) return;
      if (s.winner !== null || s.matchWinner !== null) return;
      const turn = s.turn;
      if (!s.active[turn]) return;
      const remain = liveRemaining(s.clocks, turn, turn, Date.now());
      if (remain <= 0) {
        pushLog(`${nameOf(turn)} ran out of time`);
        hostApplyForfeit(turn);
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [isHost, status, coinflip, hostApplyForfeit, pushLog, nameOf]);

  const handleMove = useCallback((move: Move) => {
    if (status !== "connected") return;
    initSoundOnGesture();
    play(move.kind === "wall" ? "wall" : "click");
    markActivity(slotRef.current);
    if (isHost) {
      const next = applyMove(stateRef.current, 0, move);
      if (next) {
        if (stateRef.current.clocks) {
          next.clocks = endTurn(stateRef.current.clocks, 0, Date.now());
        }
        setState(next);
        roomRef.current?.send({ type: "state", payload: next });
      }
    } else {
      roomRef.current?.send({ type: "move", payload: { from: slotRef.current, move } });
    }
  }, [isHost, status, markActivity]);

  const nextRound = useCallback(() => {
    if (isHost) { if (stateRef.current.matchWinner === null) hostStartRound(); }
    else roomRef.current?.send({ type: "nextRound", payload: {} });
  }, [isHost, hostStartRound]);

  const newMatchAction = useCallback(() => {
    if (isHost) hostStartMatch();
    else roomRef.current?.send({ type: "newMatch", payload: {} });
  }, [isHost, hostStartMatch]);

  const forfeit = useCallback(() => {
    if (status !== "connected") return;
    if (state.winner !== null || state.matchWinner !== null) return;
    if (!state.active[you]) return;
    const ok = window.confirm("Forfeit this round?");
    if (!ok) return;
    if (isHost) { pushLog(`${ident.name} forfeited the round`); hostApplyForfeit(0); }
    else roomRef.current?.send({ type: "forfeit", payload: { from: slotRef.current } });
  }, [isHost, status, state, you, hostApplyForfeit, pushLog, ident.name]);

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setToast("Code copied"); window.setTimeout(() => setToast(null), 1400);
  }, [code]);

  // ---------- Sound on round/match transitions ----------
  const prevWinnerRef = useRef<PlayerId | null>(null);
  const prevMatchWinnerRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (state.winner !== null && prevWinnerRef.current === null) play("roundWin");
    if (state.matchWinner !== null && prevMatchWinnerRef.current === null) play("matchWin");
    prevWinnerRef.current = state.winner;
    prevMatchWinnerRef.current = state.matchWinner;
  }, [state.winner, state.matchWinner]);

  // ---------- Record match to Supabase (host only, once per match) ----------
  useEffect(() => {
    if (!isHost) return;
    if (state.matchWinner === null) return;
    if (matchRecordedRef.current) return;
    matchRecordedRef.current = true;
    const r = rosterRef.current;
    const winnerEntry = r.find((e) => e.slot === state.matchWinner);
    void recordMatch({
      mode: state.mode as 2 | 4,
      rounds: state.totalRounds,
      winnerId: winnerEntry?.playerId ?? null,
      players: Array.from({ length: state.mode }, (_, i) => {
        const entry = r.find((e) => e.slot === i);
        return {
          id: entry?.playerId ?? null,
          slot: i,
          name: entry?.name ?? `Player ${i + 1}`,
          roundsWon: state.score[i] ?? 0,
          wallsPlaced: state.wallsPlacedByPlayer[i] ?? 0,
          pawnsEliminated: state.pawnsEliminatedByPlayer[i] ?? 0,
          forfeited: state.leftMatch[i] ?? false,
        };
      }),
    });
  }, [isHost, state]);

  // ---------- Bump my personal stats (every client) ----------
  useEffect(() => {
    if (state.matchWinner === null) return;
    const iWon = state.matchWinner === you;
    const walls = state.wallsPlacedByPlayer[you] ?? 0;
    const pops = state.pawnsEliminatedByPlayer[you] ?? 0;
    const forfeited = state.leftMatch[you] ?? false;
    void bumpMyStats(ident.id, {
      matches: 1, wins: iWon ? 1 : 0, losses: iWon ? 0 : 1,
      walls_placed: walls, pawns_eliminated: pops, forfeits: forfeited ? 1 : 0,
    });
    // Only fire once per match end
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.matchWinner]);

  const roundOver = state.winner !== null;
  const matchOver = state.matchWinner !== null;
  const boardInteractive = status === "connected" && state.winner === null && !coinflip?.animating;

  return (
    <div className="grid w-full max-w-6xl gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-1 flex min-w-0 flex-col gap-3">
        <TurnBar state={state} you={you} status={status} presence={presence} coinAnimating={!!coinflip?.animating} nameOf={nameOf} />
        {afk && state.winner === null && state.matchWinner === null && (
          <AfkBanner slot={afk.slot} deadline={afk.deadline} name={nameOf(afk.slot)} />
        )}
        <div className="relative">
          <QuoridorBoard state={state} you={you} onMove={handleMove} interactive={boardInteractive} onActivity={() => markActivity(you)} />
          {coinflip?.animating && <CoinflipOverlay starter={coinflip.starter} you={you} mode={state.mode as Mode} name={nameOf(coinflip.starter)} />}
          {status === "waiting" && presence.count < presence.expected && (
            <WaitingOverlay count={presence.count} expected={presence.expected} isHost={isHost} onStart={hostStartMatch} />
          )}
          {status === "error" && <ErrorOverlay msg={errorMsg} onLeave={onLeave} />}
          {status === "disconnected" && !roundOver && (
            <MessageOverlay title="Disconnected" body="Connection to the room was lost." onLeave={onLeave} />
          )}
          {roundOver && !matchOver && (
            <WinOverlay state={state} you={you} matchOver={false} nameOf={nameOf}
              onPrimary={nextRound} primaryLabel="Next round" onLeave={onLeave} />
          )}
          {matchOver && (
            <EndScreen state={state} you={you} nameOf={nameOf}
              onPrimary={newMatchAction} onLeave={onLeave} />
          )}
        </div>
      </div>

      <aside className="order-2 flex min-w-0 flex-col gap-3">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Room code</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-mono text-xl tracking-[0.3em] text-primary sm:text-2xl">{code}</p>
            <button onClick={copyCode} className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary">Copy</button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isHost ? "Share this code." : "Connected to host."} · {presence.count}/{presence.expected} in
          </p>
          {toast && <p className="toast-in mt-2 text-[10px] uppercase tracking-widest text-primary">{toast}</p>}
        </div>

        <ScoreCard state={state} you={you} nameOf={nameOf} />
        <ClocksCard state={state} you={you} nameOf={nameOf} />
        <PlayersCard state={state} you={you} nameOf={nameOf} />
        <EventLog entries={log} />

        <div className="flex flex-col gap-2">
          <button onClick={forfeit}
            disabled={status !== "connected" || state.winner !== null || state.matchWinner !== null || !state.active[you]}
            className="rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary/50 disabled:opacity-40"
            style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>
            Forfeit round
          </button>
          <div className="flex gap-2">
            <button onClick={newMatchAction} disabled={status !== "connected" || !!coinflip?.animating}
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary disabled:opacity-40">
              New match
            </button>
            <button onClick={onLeave} className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
              Leave
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ---------------- SUBCOMPONENTS ----------------

function TurnBar({ state, you, status, presence, coinAnimating, nameOf }: {
  state: GameState; you: PlayerId; status: Status;
  presence: { count: number; expected: number }; coinAnimating: boolean;
  nameOf: (s: PlayerId) => string;
}) {
  const active = state.turn;
  const yourTurn = state.turn === you && state.winner === null && state.active[you];
  const highlight = state.matchWinner !== null ? state.matchWinner
    : state.winner !== null ? state.winner : active;
  const color = PLAYER_COLORS[highlight];
  const label =
    status !== "connected" ? `Waiting… ${presence.count}/${presence.expected}` :
    coinAnimating ? "Flipping the coin…" :
    state.matchWinner !== null ? `${nameOf(state.matchWinner)} won the match` :
    state.winner !== null ? `${nameOf(state.winner)} took the round` :
    yourTurn ? "Your turn" : `${nameOf(active)}'s turn`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold"
        style={{ background: color, color: "oklch(0.15 0.02 55)", boxShadow: `0 0 14px color-mix(in oklab, ${color} 55%, transparent)` }}>
        {highlight + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-base font-semibold">{label}</p>
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {state.mode}-player · best of {state.totalRounds}
        </p>
      </div>
    </div>
  );
}

function AfkBanner({ deadline, name }: { slot: PlayerId; deadline: number; name: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, []);
  const remain = Math.max(0, deadline - now);
  const mm = Math.floor(remain / 60000);
  const ss = Math.floor((remain % 60000) / 1000).toString().padStart(2, "0");
  return (
    <div className="afk-pulse rounded-xl border px-4 py-2 text-sm font-medium"
      style={{ borderColor: "var(--destructive)", color: "var(--destructive)", background: "oklch(0.6 0.2 25 / 0.08)" }}>
      {name} is AFK — forfeiting in {mm}:{ss}
    </div>
  );
}

function ScoreCard({ state, you, nameOf }: { state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string }) {
  const target = winsNeeded(state.totalRounds);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Score</p>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">first to {target}</p>
      </div>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${state.mode}, 1fr)` }}>
        {Array.from({ length: state.mode }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-2">
            <span className="truncate max-w-full text-[10px] uppercase tracking-[0.15em]"
              style={{ color: state.matchWinner === i ? PLAYER_COLORS[i] : "var(--muted-foreground)" }}>
              {i === you ? "You" : nameOf(i as PlayerId)}
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full text-lg font-semibold"
              style={{
                background: PLAYER_COLORS[i], color: "oklch(0.15 0.02 55)",
                boxShadow: state.matchWinner === i ? `0 0 0 3px color-mix(in oklab, ${PLAYER_COLORS[i]} 45%, transparent)` : "0 1px 3px rgba(0,0,0,0.4)",
              }}>
              {state.score[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayersCard({ state, you, nameOf }: { state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Players</p>
      <div className="mt-3 flex flex-col gap-3">
        {state.pawns.map((_, i) => {
          const isActiveTurn = state.turn === i && state.winner === null && state.active[i];
          const eliminated = !state.active[i];
          const left = state.leftMatch[i];
          const color = PLAYER_COLORS[i];
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold"
                style={{
                  background: color, color: "oklch(0.15 0.02 55)",
                  boxShadow: isActiveTurn ? `0 0 0 3px color-mix(in oklab, ${color} 45%, transparent)` : "none",
                  opacity: left ? 0.25 : eliminated ? 0.5 : 1,
                }}>
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm" style={{ opacity: left ? 0.4 : eliminated ? 0.6 : 1 }}>
                {i === you ? `${nameOf(i as PlayerId)} (you)` : nameOf(i as PlayerId)}
                {left && <span className="ml-1 text-[10px] uppercase tracking-widest text-muted-foreground">left</span>}
              </span>
              <WallCounter count={state.wallsLeft[i]} color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WallCounter({ count, color }: { count: number; color: string }) {
  const shown = Math.min(count, 10);
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="block h-3 w-1.5 rounded-sm" style={{ background: i < shown ? color : "var(--border)" }} />
      ))}
      {count > 10 && <span className="ml-1 text-[10px] text-muted-foreground">+{count - 10}</span>}
    </div>
  );
}

function EventLog({ entries }: { entries: EventEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Log</p>
      <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
        {entries.slice().reverse().map((e) => (<li key={e.key}>· {e.text}</li>))}
      </ul>
    </div>
  );
}

function CoinflipOverlay({ starter, you, mode, name }: {
  starter: PlayerId; you: PlayerId; mode: Mode; name: string;
}) {
  const youStart = starter === you;
  // Two-face coin: front = starter's color, back = the other featured player.
  // In 2p that's the opponent. In 4p we pick the next player round-robin so
  // both faces still have a distinct color.
  const other = ((starter + 1) % mode) as PlayerId;
  const frontColor = PLAYER_COLORS[starter];
  const backColor = PLAYER_COLORS[other];
  // Always LAND on the front face by construction. 5 full X-rotations = 1800°.
  const endDeg = 1800;
  const faceStyle = (color: string): React.CSSProperties => ({
    background: `radial-gradient(circle at 32% 28%, color-mix(in oklab, ${color} 55%, white 50%), ${color} 55%, color-mix(in oklab, ${color} 60%, black 40%) 100%)`,
    color: "oklch(0.15 0.02 55)",
  });
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm">
      <div className="coin-stage relative h-32 w-32">
        <div className="coin-3d h-32 w-32 rounded-full"
          style={{ ["--end" as string]: `${endDeg}deg` } as React.CSSProperties}>
          <div className="coin-face front text-4xl" style={faceStyle(frontColor)}>
            {starter + 1}
          </div>
          <div className="coin-face back text-4xl" style={faceStyle(backColor)}>
            {other + 1}
          </div>
          <div className="coin-edge" />
        </div>
        <div className="coin-shadow absolute left-1/2 -bottom-4 h-2 w-24 rounded-full"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5), transparent 70%)" }} />
      </div>
      <p className="mt-6 text-sm uppercase tracking-[0.25em] text-foreground">Coin flip…</p>
      <p className="mt-1 text-xs text-muted-foreground">{youStart ? "You move first" : `${name} moves first`}</p>
    </div>
  );
}

// ---------------- CHESS CLOCK ----------------

function ChessClock({ state, playerId, nameOf, compact = false }: {
  state: GameState; playerId: PlayerId;
  nameOf: (s: PlayerId) => string; compact?: boolean;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const active = state.turn === playerId && state.winner === null
    && state.matchWinner === null && state.active[playerId];
  useEffect(() => {
    if (!state.clocks) return;
    const iv = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(iv);
  }, [state.clocks]);
  if (!state.clocks) return null;
  const remaining = liveRemaining(state.clocks, state.turn, playerId, now);
  const seconds = remaining / 1000;
  const danger = seconds <= 15;
  const warn = !danger && seconds <= 45;
  const color = PLAYER_COLORS[playerId];
  const label = nameOf(playerId);
  const cls =
    "rounded-lg border px-3 py-2 transition " +
    (active ? "clock-active " : "opacity-60 ") +
    (active && danger ? "clock-danger " : active && warn ? "clock-warn " : "");
  return (
    <div className={cls}
      style={{
        borderColor: active ? color : "var(--border)",
        background: active ? `color-mix(in oklab, ${color} 12%, var(--card))` : "var(--card)",
      }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <p className={"font-mono tabular-nums " + (compact ? "text-lg" : "text-2xl") + " leading-tight"}
        style={{ color: danger ? "var(--destructive)" : "inherit" }}>
        {formatClock(remaining)}
      </p>
    </div>
  );
}

function ClocksCard({ state, you, nameOf }: {
  state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string;
}) {
  if (!state.clocks) return null;
  // Chess.com layout: opponent(s) on top, you on bottom.
  const others: PlayerId[] = [];
  for (let i = 0; i < state.mode; i++) if (i !== you) others.push(i as PlayerId);
  return (
    <div className="flex flex-col gap-2">
      {others.map((o) => (
        <ChessClock key={o} state={state} playerId={o} nameOf={nameOf} compact={state.mode === 4} />
      ))}
      <div className="h-px bg-border/50" />
      <ChessClock state={state} playerId={you} nameOf={nameOf} />
    </div>
  );
}

function WaitingOverlay({ count, expected, isHost, onStart }: { count: number; expected: number; isHost: boolean; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
      <div className="spinner h-12 w-12 rounded-full border-2 border-primary border-t-transparent" />
      <p className="mt-4 text-sm uppercase tracking-[0.25em] text-foreground">Waiting for players…</p>
      <p className="mt-1 text-xs text-muted-foreground">{count}/{expected} connected</p>
      {isHost && count >= 2 && count < expected && (
        <button onClick={onStart} className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
          Start with {count}
        </button>
      )}
    </div>
  );
}

function ErrorOverlay({ msg, onLeave }: { msg: string | null; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/90 p-6 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{msg ?? "Unknown error"}</p>
      <button onClick={onLeave} className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
        Back to menu
      </button>
    </div>
  );
}

function MessageOverlay({ title, body, onLeave }: { title: string; body: string; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/85 p-6 text-center">
      <p className="text-2xl">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <button onClick={onLeave} className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
        Back to menu
      </button>
    </div>
  );
}

function WinOverlay({ state, you, matchOver, onPrimary, primaryLabel, onLeave, nameOf }: {
  state: GameState; you: PlayerId; matchOver: boolean;
  onPrimary: () => void; primaryLabel: string; onLeave: () => void;
  nameOf: (s: PlayerId) => string;
}) {
  const winner = (matchOver ? state.matchWinner : state.winner) as PlayerId;
  const youWon = winner === you;
  const winnerColor = PLAYER_COLORS[winner];
  const pieces = Array.from({ length: youWon ? (matchOver ? 90 : 45) : 0 }, (_, i) => i);
  const title = matchOver ? (youWon ? "Match won!" : "Match over") : (youWon ? "Round won" : "Round lost");
  const sub = matchOver
    ? youWon ? `You took the match.` : `${nameOf(winner)} took the match.`
    : youWon ? "You reached your goal." : `${nameOf(winner)} reached their goal first.`;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-lg bg-background/70 backdrop-blur-sm">
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const dx = (Math.random() - 0.5) * 40;
        const delay = Math.random() * 0.6;
        const dur = 1.6 + Math.random() * 1.4;
        const size = 6 + Math.random() * 8;
        const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
        return (
          <span key={i} className="confetti-piece absolute top-0 block rounded-sm"
            style={{
              left: `${left}%`, width: size, height: size * 1.6, background: color,
              animationDelay: `${delay}s`, animationDuration: `${dur}s`,
              ["--dx" as string]: `${dx}vw`,
            } as React.CSSProperties} />
        );
      })}
      <div className={(youWon ? "win-pop" : "lose-fade") + " relative mx-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6 text-center shadow-2xl sm:mx-0 sm:px-8 sm:py-7"}>
        <span className="grid h-14 w-14 place-items-center rounded-full text-xl font-semibold"
          style={{ background: winnerColor, color: "oklch(0.15 0.02 55)", boxShadow: `0 0 26px color-mix(in oklab, ${winnerColor} 60%, transparent)` }}>
          {winner + 1}
        </span>
        <p className="text-3xl">{title}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{sub}</p>
        <div className="mt-2 flex gap-2">
          <button onClick={onPrimary} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
            {primaryLabel}
          </button>
          <button onClick={onLeave} className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function EndScreen({ state, you, onPrimary, onLeave, nameOf }: {
  state: GameState; you: PlayerId;
  onPrimary: () => void; onLeave: () => void;
  nameOf: (s: PlayerId) => string;
}) {
  const winner = state.matchWinner as PlayerId;
  const youWon = winner === you;
  const winnerColor = PLAYER_COLORS[winner];
  const pieces = useMemo(() => Array.from({ length: youWon ? 100 : 20 }, (_, i) => i), [youWon]);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-lg bg-background/85 backdrop-blur-sm">
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const dx = (Math.random() - 0.5) * 40;
        const delay = Math.random() * 0.6;
        const dur = 1.6 + Math.random() * 1.4;
        const size = 6 + Math.random() * 8;
        const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
        return (
          <span key={i} className="confetti-piece absolute top-0 block rounded-sm"
            style={{
              left: `${left}%`, width: size, height: size * 1.6, background: color,
              animationDelay: `${delay}s`, animationDuration: `${dur}s`,
              ["--dx" as string]: `${dx}vw`,
            } as React.CSSProperties} />
        );
      })}
      <div className={(youWon ? "win-pop" : "lose-fade") + " relative flex w-[min(92vw,520px)] flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6 text-center shadow-2xl"}>
        <span className="grid h-14 w-14 place-items-center rounded-full text-xl font-semibold"
          style={{ background: winnerColor, color: "oklch(0.15 0.02 55)", boxShadow: `0 0 26px color-mix(in oklab, ${winnerColor} 60%, transparent)` }}>
          {winner + 1}
        </span>
        <p className="text-3xl">{youWon ? "Match won!" : `${nameOf(winner)} wins the match`}</p>

        <div className="mt-2 w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-1 text-left">Player</th>
                <th className="py-1 text-right">Rounds</th>
                <th className="py-1 text-right">Walls</th>
                <th className="py-1 text-right">Pops</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: state.mode }, (_, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 text-left">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PLAYER_COLORS[i] }} />
                    {i === you ? `${nameOf(i as PlayerId)} (you)` : nameOf(i as PlayerId)}
                    {state.leftMatch[i] && <span className="ml-1 text-[10px] uppercase text-muted-foreground">· left</span>}
                  </td>
                  <td className="py-1.5 text-right font-semibold">{state.score[i]}</td>
                  <td className="py-1.5 text-right">{state.wallsPlacedByPlayer[i] ?? 0}</td>
                  <td className="py-1.5 text-right">{state.pawnsEliminatedByPlayer[i] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button onClick={onPrimary} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
            New match
          </button>
          <Link to="/stats" className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            View stats
          </Link>
          <button onClick={onLeave} className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const [muted, setMutedS] = useState(isMuted());
  const [vol, setVolS] = useState(getVolume());
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Settings</h2>
          <button onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Close</button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <label className="text-sm">Mute all sounds</label>
          <input type="checkbox" checked={muted} onChange={(e) => { setMutedS(e.target.checked); setMuted(e.target.checked); }} />
        </div>
        <div className="mt-4">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Master volume</label>
          <input type="range" min={0} max={1} step={0.05} value={vol}
            onChange={(e) => { const v = Number(e.target.value); setVolS(v); setVolume(v); }}
            className="mt-2 w-full accent-[color:var(--primary)]" />
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Sounds initialize on your first click and are stored in this browser.
        </p>
      </div>
    </div>
  );
}

// ---------------- BOT GAME (opponent presented as a human player) ----------------

function BotGame({ ident, difficulty, opponentName, onLeave }: {
  ident: Identity;
  difficulty: number;
  opponentName: string;
  onLeave: () => void;
}) {
  const YOU: PlayerId = 0;
  const BOT: PlayerId = 1;

  const initial = useCallback((): GameState => {
    const s = initialState(2, defaultWallsFor(2), 5);
    return { ...s, clocks: initClocks(2, DEFAULT_CLOCK_MS) };
  }, []);

  const [state, setState] = useState<GameState>(initial);
  const stateRef = useRef(state); stateRef.current = state;
  const [coinflip, setCoinflip] = useState<{ starter: PlayerId; animating: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const nameOf = useCallback(
    (s: PlayerId) => (s === YOU ? ident.name : opponentName),
    [ident.name, opponentName],
  );

  const startCoinflip = useCallback((starter: PlayerId) => {
    setCoinflip({ starter, animating: true });
    play("matchStart");
    window.setTimeout(() => setCoinflip((cf) => (cf ? { ...cf, animating: false } : cf)), 1900);
  }, []);

  const startRound = useCallback((base?: GameState) => {
    const src = base ?? stateRef.current;
    const starter = (Math.random() < 0.5 ? 0 : 1) as PlayerId;
    const ns = newRound(src, starter);
    // Fresh clocks + timestamp starts once the coinflip finishes.
    const withClocks: GameState = {
      ...ns,
      clocks: {
        remaining: [DEFAULT_CLOCK_MS, DEFAULT_CLOCK_MS],
        turnStartedAt: Date.now() + 1900,
        total: DEFAULT_CLOCK_MS,
      },
    };
    setState(withClocks);
    startCoinflip(starter);
  }, [startCoinflip]);

  const startMatch = useCallback(() => {
    startRound(initial());
  }, [startRound, initial]);

  // Kick off the first round on mount.
  useEffect(() => { startMatch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Sound cues.
  const prevWinnerRef = useRef<PlayerId | null>(null);
  const prevMatchWinnerRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (state.winner !== null && prevWinnerRef.current === null) play("roundWin");
    if (state.matchWinner !== null && prevMatchWinnerRef.current === null) play("matchWin");
    prevWinnerRef.current = state.winner;
    prevMatchWinnerRef.current = state.matchWinner;
  }, [state.winner, state.matchWinner]);

  // Helper: apply a move and roll the clock over to the next player.
  const applyLocalMove = useCallback((mover: PlayerId, move: Move): GameState | null => {
    const cur = stateRef.current;
    const ns = applyMove(cur, mover, move);
    if (!ns) return null;
    if (cur.clocks) {
      ns.clocks = endTurn(cur.clocks, mover, Date.now());
    }
    return ns;
  }, []);

  // Bot's turn — think for a human amount of time, then move.
  useEffect(() => {
    if (state.winner !== null || state.matchWinner !== null) return;
    if (coinflip?.animating) return;
    if (state.turn !== BOT || !state.active[BOT]) return;

    // Pick a move up front so we can size the "thinking" time to it.
    const move = pickBotMove(state, BOT, difficulty);
    if (!move) {
      const ns = applyForfeit(state, BOT, false);
      if (ns) { setState(ns); play("pop"); }
      return;
    }
    let delay = humanThinkTimeMs(state, move, difficulty);
    // Never spend more time than the bot has on its clock.
    if (state.clocks) {
      const remaining = liveRemaining(state.clocks, state.turn, BOT, Date.now());
      delay = Math.min(delay, Math.max(120, remaining - 400));
    }
    const t = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.turn !== BOT || cur.winner !== null || cur.matchWinner !== null) return;
      const ns = applyLocalMove(BOT, move);
      if (ns) {
        setState(ns);
        play(move.kind === "wall" ? "wall" : "click");
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [state, coinflip?.animating, difficulty, applyLocalMove]);

  // Clock enforcement — if either side runs out of time, they lose the round.
  useEffect(() => {
    if (!state.clocks) return;
    if (state.winner !== null || state.matchWinner !== null) return;
    if (coinflip?.animating) return;
    const iv = window.setInterval(() => {
      const cur = stateRef.current;
      if (!cur.clocks || cur.winner !== null || cur.matchWinner !== null) return;
      if (!cur.active[cur.turn]) return;
      const remain = liveRemaining(cur.clocks, cur.turn, cur.turn, Date.now());
      if (remain <= 0) {
        const loser = cur.turn;
        const ns = applyForfeit(cur, loser, false);
        if (ns) {
          setState(ns);
          play("pop");
          setToast(loser === YOU ? "You ran out of time" : `${opponentName} ran out of time`);
          window.setTimeout(() => setToast(null), 1800);
        }
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [state.clocks, state.winner, state.matchWinner, coinflip?.animating, opponentName]);

  const handleMove = useCallback((move: Move) => {
    initSoundOnGesture();
    const cur = stateRef.current;
    if (cur.turn !== YOU) return;
    const ns = applyLocalMove(YOU, move);
    if (!ns) return;
    play(move.kind === "wall" ? "wall" : "click");
    setState(ns);
  }, [applyLocalMove]);

  const forfeit = useCallback(() => {
    if (state.winner !== null || state.matchWinner !== null) return;
    if (!state.active[YOU]) return;
    if (!window.confirm("Forfeit this round?")) return;
    const ns = applyForfeit(state, YOU, false);
    if (ns) { setState(ns); play("pop"); setToast("You forfeited the round"); window.setTimeout(() => setToast(null), 1400); }
  }, [state]);

  const nextRound = useCallback(() => {
    if (stateRef.current.matchWinner === null) startRound();
  }, [startRound]);

  const roundOver = state.winner !== null;
  const matchOver = state.matchWinner !== null;
  const boardInteractive = state.winner === null && !coinflip?.animating && state.turn === YOU;

  return (
    <div className="grid w-full max-w-6xl gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-1 flex min-w-0 flex-col gap-3">
        <TurnBar
          state={state} you={YOU} status={"connected"}
          presence={{ count: 2, expected: 2 }}
          coinAnimating={!!coinflip?.animating} nameOf={nameOf}
        />
        <div className="relative">
          <QuoridorBoard state={state} you={YOU} onMove={handleMove} interactive={boardInteractive} />
          {coinflip?.animating && (
            <CoinflipOverlay starter={coinflip.starter} you={YOU} mode={2 as Mode} name={nameOf(coinflip.starter)} />
          )}
          {roundOver && !matchOver && (
            <WinOverlay state={state} you={YOU} matchOver={false} nameOf={nameOf}
              onPrimary={nextRound} primaryLabel="Next round" onLeave={onLeave} />
          )}
          {matchOver && (
            <EndScreen state={state} you={YOU} nameOf={nameOf}
              onPrimary={startMatch} onLeave={onLeave} />
          )}
        </div>
      </div>

      <aside className="order-2 flex min-w-0 flex-col gap-3">
        <ClocksCard state={state} you={YOU} nameOf={nameOf} />
        <ScoreCard state={state} you={YOU} nameOf={nameOf} />
        <PlayersCard state={state} you={YOU} nameOf={nameOf} />

        {toast && (
          <div className="toast-in rounded-xl border border-border bg-card p-3 text-xs uppercase tracking-widest text-primary">
            {toast}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button onClick={forfeit}
            disabled={state.winner !== null || state.matchWinner !== null || !state.active[YOU]}
            className="rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary/50 disabled:opacity-40"
            style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>
            Forfeit round
          </button>
          <div className="flex gap-2">
            <button onClick={startMatch} disabled={!!coinflip?.animating}
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary disabled:opacity-40">
              New match
            </button>
            <button onClick={onLeave} className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
              Leave
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
