import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PLAYER_COLORS, QuoridorBoard } from "@/components/QuoridorBoard";
import { MoveHistory, MoveHistoryPanel, type HistorySnapshot } from "@/components/MoveHistory";
import { useMatchHistory, type MatchSnapshot } from "@/lib/matchHistory";
import { renderMatchGif, downloadBlob } from "@/lib/gifExport";
import { ChatPanel, type ChatEntry } from "@/components/ChatPanel";
import { MobileAsideSheet } from "@/components/MobileAsideSheet";
import { useServerFn } from "@tanstack/react-start";
import { moderateChatMessage, myChatBan } from "@/lib/moderation.functions";
import { renderResultCard, shareResultCard } from "@/lib/result-card";
import { supabase } from "@/integrations/supabase/client";
import { AccountNav } from "@/components/AccountNav";
import { QueuePuzzle } from "@/components/QueuePuzzle";

// Warm palette for celebratory confetti — browns, creams, blues, yellows
// pulled from the app's existing tokens (kept in-sync with styles.css).
const WARM_CONFETTI = [
  "oklch(0.82 0.16 85)",   // warm gold
  "oklch(0.72 0.09 75)",   // cream tan
  "oklch(0.55 0.09 55)",   // deep brown
  "oklch(0.62 0.14 250)",  // slate blue
  "oklch(0.88 0.06 80)",   // pale cream
  "oklch(0.66 0.14 70)",   // amber
];
import {
  applyForfeit, applyMove, defaultWallsFor, initialState, newRound, winsNeeded,
  type GameState, type Mode, type Move, type PlayerId,
} from "@/lib/quoridor";
import {
  createGuestRoom, createHostRoom, createSpectatorRoom, makeRoomCode,
  type PeerMessage, type Room, type RosterEntry,
} from "@/lib/peer-room";
import {
  getStoredIdentity, setStoredIdentity, type Identity,
} from "@/lib/identity";
import {
  bumpMyStats, fetchMyStats, fetchMyWinStreak, findOpenRoom, findOpenRoomOlderThan, recordMatch, setMatchEloDelta,
  registerOpenRoom, removeOpenRoom, updateOpenRoomSeats, applyElo1v1,
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
const SITE_URL = "https://playquoridor.online/game";

export const Route = createFileRoute("/game")({
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
  }),
});

type View =
  | { name: "boot" }
  | { name: "resume"; game: SavedGame }
  | { name: "create"; mode: Mode; walls: number; rounds: number }
  | { name: "join" }
  | { name: "quick"; mode: Mode; ranked?: boolean }
  | { name: "game"; isHost: boolean; code: string; mode: Mode; walls: number; rounds: number; quickMatch?: boolean; ranked?: boolean }
  | { name: "bot"; mode: Mode; difficulty: number; opponentNames: string[] }
  | { name: "spectate" }
  | { name: "spectating"; code: string };

type SavedGame = {
  isHost: boolean;
  code: string;
  mode: Mode;
  walls: number;
  rounds: number;
  quickMatch?: boolean;
  ranked?: boolean;
  savedAt: number;
};

const ACTIVE_GAME_KEY = "quoridor:activeGame";
const ACTIVE_GAME_TTL_MS = 2 * 60 * 60 * 1000;

function saveInterruptedGame(game: SavedGame) {
  try { localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ ...game, savedAt: Date.now() })); } catch { /* ignore */ }
}

function clearInterruptedGame() {
  try { localStorage.removeItem(ACTIVE_GAME_KEY); } catch { /* ignore */ }
}

function loadInterruptedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    const code = typeof parsed.code === "string" ? parsed.code.toUpperCase() : "";
    const mode = parsed.mode === 4 ? 4 : parsed.mode === 2 ? 2 : null;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!mode || code.length !== 5 || Date.now() - savedAt > ACTIVE_GAME_TTL_MS) {
      clearInterruptedGame();
      return null;
    }
    return {
      isHost: !!parsed.isHost,
      code,
      mode,
      walls: typeof parsed.walls === "number" ? parsed.walls : defaultWallsFor(mode),
      rounds: typeof parsed.rounds === "number" ? parsed.rounds : 3,
      quickMatch: !!parsed.quickMatch,
      ranked: !!parsed.ranked,
      savedAt,
    };
  } catch {
    clearInterruptedGame();
    return null;
  }
}

function Home() {
  const [ident, setIdent] = useState<Identity | null>(null);
  const [view, setView] = useState<View>({ name: "boot" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const navigate = useNavigate();
  const bootRan = useRef(false);
  const [aborting, setAborting] = useState(false);
  const goHome = () => {
    // Only show the aborted animation if we're leaving mid-game.
    if (view.name === "game" || view.name === "bot" || view.name === "spectating") {
      setAborting(true);
      window.setTimeout(() => { void navigate({ to: "/" }); }, 1350);
    } else {
      void navigate({ to: "/" });
    }
  };

  useEffect(() => {
    // StrictMode invokes mount effects twice in dev; guard so we don't
    // consume the sessionStorage handoff on the first pass and then
    // redirect away on the second.
    if (bootRan.current) return;
    bootRan.current = true;
    let stored = getStoredIdentity();
    if (!stored) {
      // Anonymous session: auto-mint a temporary gamer-style username so
      // players can jump straight into a game (and use chat) without an
      // account. They can still rename via the "edit" link in the menu.
      stored = setStoredIdentity(randomGamerName());
    }
    setIdent(stored);
    try {
      const saved = loadInterruptedGame();
      if (saved) { setView({ name: "resume", game: saved }); return; }
      const j = sessionStorage.getItem("quoridor:pendingJoin");
      const a = sessionStorage.getItem("quoridor:pendingAction");
      if (j) { sessionStorage.removeItem("quoridor:pendingJoin"); setPending(`join:${j}`); }
      else if (a) { sessionStorage.removeItem("quoridor:pendingAction"); setPending(a); }
      else { void navigate({ to: "/" }); }
    } catch {}
  }, [navigate]);

  useEffect(() => {
    if (!ident || !pending) return;
    if (pending === "quick2") setView({ name: "quick", mode: 2 });
    else if (pending === "quick4") setView({ name: "quick", mode: 4 });
    else if (pending === "ranked2") setView({ name: "quick", mode: 2, ranked: true });
    else if (pending === "create") setView({ name: "create", mode: 2, walls: defaultWallsFor(2), rounds: 3 });
    else if (pending === "cpu:easy") setView({ name: "bot", mode: 2, difficulty: 0.22, opponentNames: ["Tom"] });
    else if (pending === "cpu:medium") setView({ name: "bot", mode: 2, difficulty: 0.6, opponentNames: ["Jackeline"] });
    else if (pending === "cpu:hard") setView({ name: "bot", mode: 2, difficulty: 0.9, opponentNames: ["Rachel"] });
    else if (pending.startsWith("join:")) {
      const code = pending.slice(5).toUpperCase();
      if (code.length === 5) setView({ name: "game", isHost: false, code, mode: 2, walls: 10, rounds: 3 });
    }
    else if (pending.startsWith("spectate:")) {
      const code = pending.slice(9).toUpperCase();
      if (code.length === 5) setView({ name: "spectating", code });
      else setView({ name: "spectate" });
    }
    else if (pending === "spectate") {
      setView({ name: "spectate" });
    }
    setPending(null);
  }, [ident, pending]);

  return (
    <main className="min-h-screen lg:h-screen lg:overflow-hidden" onPointerDown={() => initSoundOnGesture()}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-3 py-4 sm:px-6 sm:py-6 lg:h-full lg:min-h-0 lg:py-4">
        <Header onOpenSettings={() => setSettingsOpen(true)} ident={ident} />

        {!ident ? (
          <div className="flex flex-1 items-center justify-center py-4 sm:py-6 text-sm text-muted-foreground">Opening table…</div>
        ) : (
          <div key={view.name} className="view-fade flex flex-1 items-center justify-center py-4 sm:py-6">
            {view.name === "boot" && (
              <div className="text-sm text-muted-foreground">Opening table…</div>
            )}
            {view.name === "resume" && (
              <ResumeMatchPrompt
                game={view.game}
                onReturn={() => setView({
                  name: "game",
                  isHost: view.game.isHost,
                  code: view.game.code,
                  mode: view.game.mode,
                  walls: view.game.walls,
                  rounds: view.game.rounds,
                  quickMatch: view.game.quickMatch,
                  ranked: view.game.ranked,
                })}
                onAbort={() => { clearInterruptedGame(); void navigate({ to: "/" }); }}
              />
            )}
            {view.name === "create" && (
              <CreateRoom
                mode={view.mode} walls={view.walls} rounds={view.rounds}
                setMode={(m) => setView({ ...view, mode: m, walls: defaultWallsFor(m) })}
                setWalls={(w) => setView({ ...view, walls: w })}
                setRounds={(r) => setView({ ...view, rounds: r })}
                onBack={goHome}
                onStart={(code) => setView({ name: "game", isHost: true, code, mode: view.mode, walls: view.walls, rounds: view.rounds })}
              />
            )}
            {view.name === "join" && (
              <JoinRoom
                onBack={goHome}
                onJoin={(code) => setView({ name: "game", isHost: false, code, mode: 2, walls: 10, rounds: 3 })}
              />
            )}
            {view.name === "spectate" && (
              <SpectateRoom
                onBack={goHome}
                onJoin={(code) => setView({ name: "spectating", code })}
              />
            )}
            {view.name === "spectating" && (
              <SpectatorGame
                key={"spec-" + view.code}
                ident={ident}
                code={view.code}
                onLeave={goHome}
              />
            )}
            {view.name === "quick" && (
              <QuickMatch
                mode={view.mode}
                ranked={!!view.ranked}
                ident={ident}
                onBack={goHome}
                onJoin={(code) => setView({ name: "game", isHost: false, code, mode: view.mode, walls: defaultWallsFor(view.mode), rounds: 3, quickMatch: true, ranked: !!view.ranked })}
                onHost={(code) => setView({ name: "game", isHost: true, code, mode: view.mode, walls: defaultWallsFor(view.mode), rounds: 3, quickMatch: true, ranked: !!view.ranked })}
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
                ranked={view.ranked}
                onBotFallback={view.ranked ? undefined : () => setView({
                  name: "bot",
                  mode: view.mode,
                  difficulty: randomDifficulty().value,
                  opponentNames: Array.from({ length: view.mode - 1 }, () => randomGamerName()),
                })}
                onRankedTimeout={view.ranked ? () => { void navigate({ to: "/" }); } : undefined}
                onRequeue={view.quickMatch ? () => {
                  clearInterruptedGame();
                  setView({ name: "quick", mode: view.mode, ranked: view.ranked });
                } : undefined}
                onLeave={() => { clearInterruptedGame(); goHome(); }}
              />
            )}
            {view.name === "bot" && (
              <BotGame
                ident={ident}
                mode={view.mode}
                difficulty={view.difficulty}
                opponentNames={view.opponentNames}
                onLeave={goHome}
              />
            )}
          </div>
        )}

        <Footer />
      </div>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
      {aborting && <AbortedOverlay />}
    </main>
  );
}

function AbortedOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm aborted-fade">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="aborted-ring relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-rose-500/60">
          <svg className="h-12 w-12 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="8" y1="8" x2="16" y2="16" />
          </svg>
        </div>
        <div className="aborted-text">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-rose-400">Match ended</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Game Aborted</h2>
          <p className="mt-2 text-sm text-zinc-400">Returning to lobby…</p>
        </div>
      </div>
    </div>
  );
}

function ChaosBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-600/25 via-rose-600/20 to-amber-500/20 px-4 py-2.5 shadow-lg shadow-fuchsia-900/30">
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-fuchsia-500/10 to-transparent" />
      <div className="relative flex items-center gap-3">
        <span className="text-lg">⚡</span>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-300">Chaos Mode</p>
          <p className="text-xs font-semibold text-white">4 players. One board. All bets are off.</p>
        </div>
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">FFA</span>
      </div>
    </div>
  );
}

function SaveClipButton({ state, you, nameOf, snapshot }: {
  state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string;
  snapshot: MatchSnapshot | null;
}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err" | "nope">("idle");
  const label = busy ? "Saving…"
    : saved === "ok" ? "Clip saved"
    : saved === "err" ? "Try again"
    : saved === "nope" ? "Sign in to save"
    : "Save clip";
  const onClick = async () => {
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user;
      const anon = !u || u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
      if (!u || anon) { setSaved("nope"); return; }
      const { data: p } = await supabase
        .from("players").select("id").eq("auth_user_id", u.id)
        .not("onboarded_at", "is", null).order("onboarded_at", { ascending: false })
        .limit(1).maybeSingle();
      const winnerName = state.matchWinner !== null ? nameOf(state.matchWinner) : "clip";
      const payload = snapshot ?? JSON.parse(JSON.stringify(state));
      const { error } = await supabase.from("saved_clips").insert({
        owner_auth: u.id, owner_player_id: p?.id ?? null,
        match_id: null, mode: state.mode,
        title: `${winnerName} · ${new Date().toLocaleDateString()}`,
        snapshot: payload,
      });
      if (error) { setSaved("err"); return; }
      const { data: all } = await supabase.from("saved_clips")
        .select("id").eq("owner_auth", u.id).order("created_at", { ascending: false });
      const extras = (all ?? []).slice(5).map((c) => c.id);
      if (extras.length) {
        await supabase.from("saved_clips").delete().in("id", extras);
      }
      setSaved("ok");
    } catch {
      setSaved("err");
    } finally {
      setBusy(false);
      window.setTimeout(() => setSaved("idle"), 2400);
      void you;
    }
  };
  return (
    <button onClick={onClick} disabled={busy}
      className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60">
      {label}
    </button>
  );
}

function DownloadGifButton({ snapshot }: { snapshot: MatchSnapshot | null }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!snapshot || snapshot.rounds.length === 0) return;
    setBusy(true);
    try {
      const blob = await renderMatchGif(snapshot);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `quoridor-${stamp}.gif`);
    } catch (e) {
      console.warn("gif render failed", e);
    } finally { setBusy(false); }
  };
  return (
    <button onClick={onClick} disabled={busy || !snapshot || snapshot.rounds.length === 0}
      className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60">
      {busy ? "Rendering…" : "Download GIF"}
    </button>
  );
}

function AnalyzeGameButton({ snapshot }: { snapshot: MatchSnapshot | null }) {
  const nav = useNavigate();
  const onClick = () => {
    if (!snapshot) return;
    try { sessionStorage.setItem("analyze:pending", JSON.stringify(snapshot)); } catch {}
    void nav({ to: "/analyze/$clipId", params: { clipId: "local" } });
  };
  return (
    <button onClick={onClick} disabled={!snapshot || snapshot.rounds.length === 0}
      className="rounded-lg border border-primary/60 bg-primary/10 px-5 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60">
      Analyze with engine
    </button>
  );
}

function Header({ ident, onOpenSettings }: { ident: Identity | null; onOpenSettings: () => void }) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="playquoridor.online — home">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-[#2a2a31] bg-gradient-to-br from-[#1d1d22] to-[#101013]">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <rect x="1" y="1" width="7" height="7" rx="1.5" fill="#f5a524" />
            <rect x="10" y="1" width="7" height="7" rx="1.5" fill="#2e2e36" />
            <rect x="1" y="10" width="7" height="7" rx="1.5" fill="#2e2e36" />
            <rect x="10" y="10" width="7" height="7" rx="1.5" fill="#2e2e36" />
          </svg>
        </span>
        <span className="truncate text-[15px] font-bold">
          playquoridor<span className="text-[#5c5c66]">.online</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {ident && <StreakBadge playerId={ident.id} />}
        <AccountNav compact />
        <button onClick={onOpenSettings} aria-label="Settings" className="rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] uppercase tracking-widest hover:bg-secondary sm:px-3">
          <span className="hidden sm:inline">Settings</span>
          <span className="sm:hidden" aria-hidden>⚙</span>
        </button>
      </div>
    </header>
  );
}

function StreakBadge({ playerId }: { playerId: string }) {
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => { void fetchMyWinStreak(playerId).then(setStreak); }, [playerId]);
  if (streak === null) return null;
  const hot = streak >= 3;
  return (
    <span className={
      "hidden items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-widest sm:inline-flex " +
      (hot
        ? "border-orange-500/50 bg-orange-500/10"
        : "border-border bg-card")
    }>
      <span aria-hidden>{hot ? "🔥" : "✦"}</span>
      <span className="text-muted-foreground">Streak</span>
      <span className={"ml-0.5 font-semibold " + (hot ? "text-orange-300" : "text-primary")}>{streak}</span>
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

function ForfeitButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  useEffect(() => { if (disabled) setArmed(false); }, [disabled]);
  const click = () => {
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setArmed(false);
    onConfirm();
  };
  return (
    <button
      onClick={click}
      disabled={disabled}
      className={
        "rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-widest transition-colors disabled:opacity-40 " +
        (armed ? "bg-[color:var(--destructive)] text-white hover:opacity-90" : "hover:bg-secondary/50")
      }
      style={armed ? { borderColor: "var(--destructive)" } : { borderColor: "var(--destructive)", color: "var(--destructive)" }}
    >
      {armed ? "Click again to confirm" : "Forfeit round"}
    </button>
  );
}

function ResumeMatchPrompt({ game, onReturn, onAbort }: { game: SavedGame; onReturn: () => void; onAbort: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Interrupted match</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Return to game?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Room {game.code} is still reserved. Choose one action before continuing.
        </p>
        <div className="mt-6 grid gap-3">
          <button
            onClick={onReturn}
            autoFocus
            className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Return to game
          </button>
          <button
            onClick={onAbort}
            className="rounded-lg border border-border bg-secondary/30 px-5 py-3 text-sm font-semibold hover:bg-secondary"
          >
            Abort game
          </button>
        </div>
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
  // Series length is fixed for every match: best of 3, first to 2, max 3 rounds.
  void rounds; void setRounds;
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
      <div className="mt-6 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
        <p className="text-[10px] uppercase tracking-[0.2em]">Format</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Best of 3 · first to 2 · max 3 rounds</p>
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

function QuickMatch({ mode, ranked, ident, onBack, onJoin, onHost }: {
  mode: Mode; ranked?: boolean; ident: Identity;
  onBack: () => void; onJoin: (code: string) => void; onHost: (code: string) => void;
}) {
  const [status, setStatus] = useState("Searching…");
  const cancelled = useRef(false);
  const registeredCode = useRef<string | null>(null);
  const transitioned = useRef(false);

  // Play a soft radar loop while queued; stop as soon as we transition.
  useEffect(() => {
    play("searchStart");
    // Fire the first ping quickly so users get audible feedback even when
    // the match resolves in under 1.6s.
    const firstPing = window.setTimeout(() => {
      if (!cancelled.current && !transitioned.current) play("searchPing");
    }, 600);
    const ping = window.setInterval(() => {
      if (!cancelled.current && !transitioned.current) play("searchPing");
    }, 1600);
    return () => { window.clearTimeout(firstPing); window.clearInterval(ping); };
  }, []);

  useEffect(() => {
    cancelled.current = false;
    transitioned.current = false;
    registeredCode.current = null;
    let cedePoll: number | null = null;
    (async () => {
      const existing = await findOpenRoom(mode, !!ranked);
      if (cancelled.current) return;
      if (existing) {
        setStatus("Joining room…");
        transitioned.current = true;
        play("matchFound");
        onJoin(existing);
        return;
      }
      const code = makeRoomCode();
      setStatus("No matches — hosting a new room…");
      try {
        await registerOpenRoom(code, mode, ident.name, !!ranked);
        registeredCode.current = code;
      } catch {
        // If registering the queue slot fails, fall back to hosting a
        // local room anyway so the player is never stuck.
      }
      if (cancelled.current) {
        if (registeredCode.current) await removeOpenRoom(registeredCode.current);
        registeredCode.current = null;
        return;
      }
      transitioned.current = true;
      onHost(code);
      // Race fix: two searchers can each register their own room before
      // either sees the other. After we hand off to GameScreen (which sets
      // up the peer host), keep polling briefly for an older sibling room —
      // if one exists we should be the guest instead. We only cede to a
      // strictly older room to keep the decision deterministic (the older
      // room never cedes to us).
      if (registeredCode.current) {
        const myCode = registeredCode.current;
        const started = Date.now();
        const tick = async () => {
          if (cancelled.current) return;
          // Stop trying to cede once someone has actually joined our peer
          // room (open_rooms row is removed on onFull) or ~8s have passed.
          if (Date.now() - started > 8000) {
            if (cedePoll != null) window.clearInterval(cedePoll);
            return;
          }
          try {
            const older = await findOpenRoomOlderThan(myCode, mode, !!ranked);
            if (!older || cancelled.current) return;
            if (cedePoll != null) window.clearInterval(cedePoll);
            await removeOpenRoom(myCode);
            registeredCode.current = null;
            // GameScreen is already mounted as host — the parent's onJoin
            // will swap the view to guest, tearing that peer session down.
            play("matchFound");
            onJoin(older);
          } catch { /* transient; try again next tick */ }
        };
        cedePoll = window.setInterval(tick, 1500);
        // Fire once immediately so a fast second registration also flips.
        void tick();
      }
    })();
    const onUnload = () => {
      if (registeredCode.current && !transitioned.current) {
        // Best-effort — the tab is closing, fire-and-forget.
        void removeOpenRoom(registeredCode.current);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      cancelled.current = true;
      window.removeEventListener("beforeunload", onUnload);
      if (cedePoll != null) window.clearInterval(cedePoll);
      if (registeredCode.current && !transitioned.current) {
        void removeOpenRoom(registeredCode.current);
        registeredCode.current = null;
      }
    };
  }, [mode, ranked, ident.name, onJoin, onHost]);

  return (
    <SearchingAnimation
      status={status}
      ranked={!!ranked}
      mode={mode}
      onBack={() => {
        // Explicit back: make sure the queue slot is released before we
        // navigate away. Cleanup will also fire but this is defensive.
        if (registeredCode.current && !transitioned.current) {
          void removeOpenRoom(registeredCode.current);
          registeredCode.current = null;
        }
        onBack();
      }}
    />
  );
}

function SearchingAnimation({ status, ranked, mode, onBack, compact = false }: {
  status: string; ranked: boolean; mode: Mode; onBack: () => void; compact?: boolean;
}) {
  const opponents = Math.max(1, mode - 1);
  return (
    <div className={"w-full overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/30 text-center shadow-[0_30px_80px_-20px_rgba(16,185,129,0.35)] " + (compact ? "max-w-sm p-6" : "max-w-lg p-10")}>
      {/* Radar */}
      <div className={"relative mx-auto grid place-items-center " + (compact ? "h-40 w-40" : "h-56 w-56")}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border border-emerald-400/40"
            style={{
              animation: `qm-ping 2.4s cubic-bezier(0,0,0.2,1) ${i * 0.8}s infinite`,
            }}
          />
        ))}
        {/* Sweeping conic beam */}
        <span
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(16,185,129,0) 250deg, rgba(52,211,153,0.55) 330deg, rgba(16,185,129,0) 360deg)",
            animation: "qm-sweep 2.2s linear infinite",
            maskImage: "radial-gradient(circle, black 40%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(circle, black 40%, transparent 72%)",
          }}
        />
        {/* Core */}
        <span className="relative z-10 h-6 w-6 rounded-full bg-emerald-400 shadow-[0_0_30px_8px_rgba(16,185,129,0.55)]" />
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-emerald-400/15" />
      </div>

      <p className={"text-xs font-semibold uppercase tracking-[0.4em] text-emerald-400 " + (compact ? "mt-5" : "mt-8")}>
        {ranked ? "Ranked queue" : "Quick match"}
      </p>
      <p className={"font-semibold tracking-tight text-zinc-50 " + (compact ? "mt-2 text-lg" : "mt-2 text-2xl")}>
        <span className="qm-dots">{status.replace(/…$/, "")}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-500">Looking for {opponents} player{opponents === 1 ? "" : "s"} nearby</p>

      <button
        onClick={onBack}
        className={"rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-300 transition-colors hover:bg-zinc-800 " + (compact ? "mt-5" : "mt-8")}
      >
        Cancel
      </button>

      <style>{`
        @keyframes qm-ping {
          0%   { transform: scale(0.35); opacity: 0.9; }
          80%  { opacity: 0; }
          100% { transform: scale(1);    opacity: 0; }
        }
        @keyframes qm-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes qm-dot {
          0%, 20%  { opacity: 0; }
          40%      { opacity: 1; }
          100%     { opacity: 0; }
        }
        .qm-dots::after {
          content: '';
          display: inline-block;
          width: 1.2em;
          text-align: left;
          animation: none;
        }
        .qm-dots::after {
          content: '.';
          animation: qm-dot 1.4s steps(3, end) infinite;
        }
      `}</style>
    </div>
  );
}

// ---------------- GAME ----------------

type Status = "connecting" | "waiting" | "connected" | "disconnected" | "error";

type EventEntry = { key: number; text: string };

type AfkState = { slot: PlayerId; deadline: number } | null;

// After 45s of no input we surface the AFK banner as a warning, then forfeit
// for time after another 15s (60s total idle → auto-forfeit).
const AFK_IDLE_MS = 45_000;
const AFK_COUNTDOWN_MS = 15_000;

function GameScreen({
  ident, code, isHost, mode: initialMode, initialWalls, initialRounds, onLeave,
  quickMatch, ranked, onBotFallback, onRankedTimeout, onRequeue,
}: {
  ident: Identity; code: string; isHost: boolean; mode: Mode;
  initialWalls: number; initialRounds: number; onLeave: () => void;
  quickMatch?: boolean; ranked?: boolean; onBotFallback?: () => void;
  onRankedTimeout?: () => void;
  onRequeue?: () => void;
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
  const matchHistory = useMatchHistory(state, Array.from({ length: initialMode }, (_, i) => rosterRef.current.find((e) => e.slot === i)?.name ?? `Player ${i + 1}`));

  const [coinflip, setCoinflip] = useState<{ starter: PlayerId; animating: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [log, setLog] = useState<EventEntry[]>([]);
  const [afk, setAfk] = useState<AfkState>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const roomRef = useRef<Room | null>(null);
  const matchRecordedRef = useRef(false);
  const matchStartedRef = useRef(false);

  // Ready-up state for the between-rounds flow (replaces "Next round" button).
  const [readySlots, setReadySlots] = useState<PlayerId[]>([]);
  const [merging, setMerging] = useState(false);

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
    window.setTimeout(() => setCoinflip((cf) => (cf ? { ...cf, animating: false } : cf)), 4200);
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
        turnStartedAt: Date.now() + 4200,
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
    matchStartedRef.current = true;
    const { totalWalls, totalRounds, mode } = stateRef.current;
    hostStartRound(initialState(mode, totalWalls, totalRounds));
    // Kick every match off with a friendly reminder. Host is the source of
    // truth so the message shows up once for everyone.
    const sys = { slot: -1, name: "System", text: "Be respectful 🙌 — good luck & have fun.", ts: Date.now() };
    const sysKey = `sys-greet-${sys.ts}`;
    setChat((prev) => {
      if (prev.some((m) => m.slot === null && m.text === sys.text)) return prev;
      return [...prev.slice(-99), { key: sysKey, slot: null, name: sys.name, text: sys.text, ts: sys.ts }];
    });
    roomRef.current?.send({ type: "chat", payload: sys });
  }, [hostStartRound]);

  const hostApplyForfeit = useCallback((
    who: PlayerId,
    permanent = false,
    reason: "time" | "forfeit" | "afk" | "left" = "forfeit",
  ) => {
    const ns = applyForfeit(stateRef.current, who, permanent);
    if (!ns) return;
    if (ns.winner !== null) { ns.endReason = reason; ns.endLoser = who; }
    setState(ns);
    roomRef.current?.send({ type: "state", payload: ns });
    play("pop");
  }, []);

  // Explicit leave: notify other players so they get "X left the match" and
  // (in 2-player rooms) an immediate win, instead of a generic disconnect.
  const handleLeave = useCallback(() => {
    clearInterruptedGame();
    const s = stateRef.current;
    const inMatch = s.matchWinner === null && (status === "connected" || status === "waiting");
    if (inMatch) {
      try {
        if (isHost) {
          hostApplyForfeit(slotRef.current, true, "left");
        } else {
          roomRef.current?.send({ type: "leave", payload: { slot: slotRef.current } });
        }
      } catch { /* best-effort */ }
    }
    // Small delay so the leave/state message actually flushes over the wire
    // before we tear the peer connection down.
    window.setTimeout(() => { onLeave(); }, 120);
  }, [status, isHost, hostApplyForfeit, onLeave]);

  // Host-authoritative ready tracking. Guest clicks send a "ready" message;
  // host writes to local state and broadcasts the canonical list.
  const markSlotReady = useCallback((slot: PlayerId) => {
    setReadySlots((prev) => {
      if (prev.includes(slot)) return prev;
      const next = [...prev, slot];
      if (isHost) roomRef.current?.send({ type: "readyState", payload: { slots: next } });
      return next;
    });
  }, [isHost]);

  const requestReady = useCallback(() => {
    if (stateRef.current.winner === null) return;
    if (stateRef.current.matchWinner !== null) return;
    const s = slotRef.current;
    if (isHost) markSlotReady(s);
    else roomRef.current?.send({ type: "ready", payload: { slot: s } });
  }, [isHost, markSlotReady]);

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
      onGuestLeft: (_s: number, name: string) => { pushLog(`${name} disconnected`); },
      onFull: () => {
        if (cancelled) return;
        setStatus("connected");
        if (quickMatch) play("matchFound");
        if (isHost) {
          void removeOpenRoom(code);
          if (!matchStartedRef.current) hostStartMatch();
        }
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
            markActivity(p.from);
            if (stateRef.current.clocks) {
              next.clocks = endTurn(stateRef.current.clocks, p.from, Date.now());
            }
            if (next.winner !== null) {
              next.endReason = "goal";
              next.endLoser = (next.winner === 0 ? 1 : 0) as PlayerId;
            }
            setState(next);
            roomRef.current?.send({ type: "state", payload: next });
          }
        } else if (msg.type === "forfeit" && isHost) {
          const p = msg.payload as { from: PlayerId };
          pushLog(`${nameOf(p.from)} forfeited the round`);
          hostApplyForfeit(p.from, false, "forfeit");
        } else if (msg.type === "leave" && isHost) {
          const p = msg.payload as { slot: number };
          pushLog(`${nameOf(p.slot as PlayerId)} left the match`);
          hostApplyForfeit(p.slot as PlayerId, true, "left");
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
        } else if (msg.type === "ready" && isHost) {
          const p = msg.payload as { slot: number };
          markSlotReady(p.slot as PlayerId);
        } else if (msg.type === "readyState") {
          const p = msg.payload as { slots: number[] };
          setReadySlots(p.slots as PlayerId[]);
        } else if (msg.type === "chat") {
          const p = msg.payload as { slot: number; name: string; text: string; ts: number };
          const isSystem = (p.slot as number) < 0;
          setChat((prev) => {
            // Dedupe system greetings: host already appended locally before
            // broadcasting, and the greeting can also arrive via replay.
            if (isSystem && prev.some((m) => m.slot === null && m.text === p.text)) return prev;
            return [
              ...prev.slice(-99),
              {
                key: `${p.ts}-${p.slot}-${Math.random()}`,
                slot: isSystem ? null : p.slot,
                name: p.name, text: p.text, ts: p.ts,
              },
            ];
          });
          if (!isSystem) play("click");
        }
      },
      onError: (err: Error) => {
        if (cancelled) return;
        console.error(err);
        const em = err?.message ?? String(err);
        // Ranked joiner hit a stale/dead host — purge the room and surface
        // the "search time exceeded" screen instead of a scary error.
        if (ranked && !isHost && onRankedTimeout &&
            (em.includes("peer-unavailable") || em.toLowerCase().includes("could not connect"))) {
          void removeOpenRoom(code);
          onRankedTimeout();
          return;
        }
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
        if (isHost) void registerOpenRoom(code, initialMode, ident.name, !!ranked);
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

  // Release the queue slot if the tab closes while we're still waiting for
  // an opponent. Once the match has actually started we leave the row
  // alone (it was already removed on `onFull`).
  useEffect(() => {
    if (!isHost) return;
    const onUnload = () => { void removeOpenRoom(code); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [isHost, code]);

  const you = slot;

  useEffect(() => {
    if (state.matchWinner !== null) {
      clearInterruptedGame();
      return;
    }
    // Don't persist an "active game" while the host is still alone in the
    // queue — otherwise leaving the queue would surface a stale Resume
    // prompt and block the player from starting a new match.
    const bothIn = presence.count >= presence.expected;
    if (!bothIn && !matchStartedRef.current) {
      return;
    }
    saveInterruptedGame({
      isHost,
      code,
      mode: initialMode,
      walls: initialWalls,
      rounds: initialRounds,
      quickMatch,
      ranked,
      savedAt: Date.now(),
    });
  }, [state.matchWinner, isHost, code, initialMode, initialWalls, initialRounds, quickMatch, ranked, presence.count, presence.expected]);

  const [matchMuted, setMatchMuted] = useState(false);
  const [chatBan, setChatBan] = useState<null | { until: string | null; reason: string | null }>(null);
  const callModerate = useServerFn(moderateChatMessage);
  const callMyBan = useServerFn(myChatBan);

  useEffect(() => {
    let alive = true;
    void callMyBan({}).then((r) => {
      if (!alive) return;
      if (r.active) setChatBan({ until: r.until, reason: r.reason });
    }).catch(() => {});
    return () => { alive = false; };
  }, [callMyBan]);

  const pushLocalSystem = useCallback((text: string) => {
    setChat((prev) => [
      ...prev.slice(-99),
      { key: `sys-${Date.now()}-${Math.random()}`, slot: null, name: "System", text, ts: Date.now() },
    ]);
  }, []);

  const sendChat = useCallback((text: string) => {
    const s = slotRef.current;
    const name = rosterRef.current.find((e) => e.slot === s)?.name ?? `Player ${s + 1}`;

    if (chatBan) {
      pushLocalSystem(`You're chat-banned${chatBan.until ? ` until ${new Date(chatBan.until).toLocaleString()}` : ""}. Message not sent.`);
      return;
    }
    if (matchMuted) {
      pushLocalSystem("You're muted for this match. Message not sent.");
      return;
    }

    // Optimistic append for the sender only.
    const ts = Date.now();
    const optimisticKey = `${ts}-${s}-me-${Math.random()}`;
    setChat((prev) => [
      ...prev.slice(-99),
      { key: optimisticKey, slot: s as number, name, text, ts },
    ]);

    void (async () => {
      try {
        const res = await callModerate({ data: { playerId: ident.id, matchId: code, text } });
        if (res.allow) {
          roomRef.current?.send({ type: "chat", payload: { slot: s as number, name, text, ts } });
          return;
        }
        // Rejected: strip the optimistic message and show a private system note.
        setChat((prev) => prev.filter((m) => m.key !== optimisticKey));
        pushLocalSystem(res.senderMessage);
        if (res.penalty === "match_mute") setMatchMuted(true);
        if (res.penalty === "chat_ban_24h" || res.penalty === "chat_ban_7d" || res.penalty === "perm") {
          setChatBan({ until: null, reason: res.reason });
        }
        if (res.lobbyMessage) {
          const sys = { slot: -1, name: "System", text: res.lobbyMessage, ts: Date.now() };
          setChat((prev) => [
            ...prev.slice(-99),
            { key: `sys-${sys.ts}-${Math.random()}`, slot: null, name: sys.name, text: sys.text, ts: sys.ts },
          ]);
          roomRef.current?.send({ type: "chat", payload: sys });
        }
      } catch (e: unknown) {
        setChat((prev) => prev.filter((m) => m.key !== optimisticKey));
        pushLocalSystem(`Message couldn't be sent (moderation error).`);
      }
    })();
  }, [callModerate, chatBan, code, ident.id, matchMuted, pushLocalSystem]);

  // ---------- Activity + AFK (host authoritative) ----------
  const lastInputRef = useRef<number[]>(Array.from({ length: initialMode }, () => Date.now()));

  // Host-only: slots currently controlled by a local bot (used when a 4p
  // quick match starts with fewer than 4 humans and we fill the empty seats).
  const [botSlots, setBotSlots] = useState<PlayerId[]>([]);

  // ---------- Quick Match → bot fallback ----------
  // If we hosted via Quick Match and nobody joins in a while, take one of two
  // paths: (a) still alone → drop the peer room and hand off to a fresh local
  // bot game; (b) 4p with 2-3 humans in → fill the empty seats with bots so
  // the group can start instead of waiting forever.
  useEffect(() => {
    if (!quickMatch || !isHost) return;
    // Ranked: no bot fallback. Wait up to 2 minutes for an opponent, then
    // return to lobby with a "search time exceeded" screen.
    if (ranked) {
      if (!onRankedTimeout) return;
      const rankedTimeoutMs = initialMode === 4 ? 30_000 : 120_000;
      const t = window.setTimeout(() => {
        if (presenceRef.current.count >= presenceRef.current.expected) return;
        if (stateRef.current.matchWinner !== null) return;
        void removeOpenRoom(code);
        roomRef.current?.close();
        roomRef.current = null;
        onRankedTimeout();
      }, rankedTimeoutMs);
      return () => window.clearTimeout(t);
    }
    // 4p: after 60s with 2-3 humans, fill the empty seats with bots.
    const partialFillT = initialMode === 4 ? window.setTimeout(() => {
      const cur = presenceRef.current;
      if (cur.count >= cur.expected) return;
      if (cur.count < 2) return; // solo fallback handles this
      if (stateRef.current.matchWinner !== null) return;
      const missing = cur.expected - cur.count;
      if (missing <= 0) return;
      const bots = Array.from({ length: missing }, () => ({ name: randomGamerName() }));
      const assigned = roomRef.current?.addBotPlayers?.(bots) ?? [];
      if (assigned.length > 0) {
        setBotSlots((prev) => [...prev, ...assigned.map((s) => s as PlayerId)]);
        void removeOpenRoom(code);
      }
    }, 60_000) : null;
    // Solo-host fallback → replace with a full local bot game.
    let soloT: number | null = null;
    if (onBotFallback) {
      const soloDelay = initialMode === 4 ? 60_000 : 30_000;
      soloT = window.setTimeout(() => {
        const cur = presenceRef.current;
        if (cur.count >= cur.expected) return;
        if (cur.count >= 2) return; // partial-fill path will handle this
        if (stateRef.current.matchWinner !== null) return;
        void removeOpenRoom(code);
        roomRef.current?.close();
        roomRef.current = null;
        onBotFallback();
      }, soloDelay);
    }
    return () => {
      if (partialFillT) window.clearTimeout(partialFillT);
      if (soloT != null) window.clearTimeout(soloT);
    };
  }, [quickMatch, isHost, onBotFallback, onRankedTimeout, ranked, code, initialMode]);

  // Host-only: when it's a bot slot's turn, think for a beat then play a move.
  useEffect(() => {
    if (!isHost) return;
    if (botSlots.length === 0) return;
    if (state.matchWinner !== null || state.winner !== null) return;
    if (coinflip?.animating) return;
    if (status !== "connected") return;
    const turn = state.turn as PlayerId;
    if (!botSlots.includes(turn)) return;
    if (!state.active[turn]) return;
    const difficulty = 0.55;
    const move = pickBotMove(state, turn, difficulty);
    if (!move) {
      hostApplyForfeit(turn, false, "forfeit");
      return;
    }
    let delay = humanThinkTimeMs(state, move, difficulty);
    if (state.clocks) {
      const remaining = liveRemaining(state.clocks, state.turn, turn, Date.now());
      delay = Math.min(delay, Math.max(200, remaining - 500));
    }
    const t = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.turn !== turn || cur.winner !== null || cur.matchWinner !== null) return;
      const next = applyMove(cur, turn, move);
      if (!next) return;
      if (cur.clocks) next.clocks = endTurn(cur.clocks, turn, Date.now());
      if (next.winner !== null) {
        next.endReason = "goal";
        next.endLoser = (next.winner === turn
          ? ((turn === 0 ? 1 : 0) as PlayerId)
          : (turn as PlayerId));
      }
      setState(next);
      roomRef.current?.send({ type: "state", payload: next });
    }, Math.max(250, delay));
    return () => window.clearTimeout(t);
  }, [isHost, botSlots, state, coinflip?.animating, status, hostApplyForfeit]);

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
      if (presenceRef.current.count < presenceRef.current.expected) {
        if (afk) setAfk(null);
        return;
      }
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
        pushLog(`${nameOf(afk.slot)} was idle for too long — forfeited on time`);
        setAfk(null);
        hostApplyForfeit(afk.slot, true, "afk");
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
      if (presenceRef.current.count < presenceRef.current.expected) return;
      if (coinflip?.animating) return;
      if (s.winner !== null || s.matchWinner !== null) return;
      const turn = s.turn;
      if (!s.active[turn]) return;
      const remain = liveRemaining(s.clocks, turn, turn, Date.now());
      if (remain <= 0) {
        pushLog(`${nameOf(turn)}'s clock ran out`);
        hostApplyForfeit(turn, false, "time");
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [isHost, status, coinflip, hostApplyForfeit, pushLog, nameOf]);

  // Reset the ready roster whenever a new round begins.
  const prevWinnerReadyRef = useRef<PlayerId | null>(state.winner);
  useEffect(() => {
    if (prevWinnerReadyRef.current !== null && state.winner === null) {
      setReadySlots([]);
      setMerging(false);
      if (isHost) roomRef.current?.send({ type: "readyState", payload: { slots: [] } });
    }
    prevWinnerReadyRef.current = state.winner;
  }, [state.winner, isHost]);

  // Host: once every still-in-match player is ready, play the merge animation
  // and then kick off the next round (which itself triggers the coinflip).
  const mergingRef = useRef(false);
  useEffect(() => { mergingRef.current = merging; }, [merging]);
  useEffect(() => {
    if (!isHost) return;
    if (state.winner === null || state.matchWinner !== null) return;
    const need: PlayerId[] = [];
    for (let i = 0; i < state.mode; i++) {
      if (!state.leftMatch[i]) need.push(i as PlayerId);
    }
    if (need.length === 0) return;
    const allReady = need.every((i) => readySlots.includes(i));
    if (!allReady || mergingRef.current) return;
    setMerging(true);
    const t = window.setTimeout(() => {
      hostStartRound();
    }, 900);
    return () => window.clearTimeout(t);
  }, [isHost, readySlots, state.winner, state.matchWinner, state.leftMatch, state.mode, hostStartRound]);

  const handleMove = useCallback((move: Move) => {
    if (status !== "connected") return;
    initSoundOnGesture();
    play(move.kind === "wall" ? "wall" : "pop");
    markActivity(slotRef.current);
    if (isHost) {
      const next = applyMove(stateRef.current, 0, move);
      if (next) {
        if (stateRef.current.clocks) {
          next.clocks = endTurn(stateRef.current.clocks, 0, Date.now());
        }
        if (next.winner !== null) {
          next.endReason = "goal";
          next.endLoser = (next.winner === 0 ? 1 : 0) as PlayerId;
        }
        setState(next);
        roomRef.current?.send({ type: "state", payload: next });
      }
    } else {
      roomRef.current?.send({ type: "move", payload: { from: slotRef.current, move } });
    }
  }, [isHost, status, markActivity]);

  const newMatchAction = useCallback(() => {
    if (isHost) hostStartMatch();
    else roomRef.current?.send({ type: "newMatch", payload: {} });
  }, [isHost, hostStartMatch]);

  // Rematch = play again with the same opponents. Also fires a lightweight
  // chat notification so the other side sees "@name wants a rematch".
  const rematchAction = useCallback(() => {
    const name = rosterRef.current.find((e) => e.slot === slotRef.current)?.name
      ?? `Player ${slotRef.current + 1}`;
    const text = `${name} wants a rematch 🔁`;
    const ts = Date.now();
    const sys = { slot: -1, name: "System", text, ts };
    setChat((prev) => {
      if (prev.some((m) => m.slot === null && m.text === text)) return prev;
      return [
        ...prev.slice(-99),
        { key: `sys-rematch-${ts}`, slot: null, name: "System", text, ts },
      ];
    });
    roomRef.current?.send({ type: "chat", payload: sys });
    newMatchAction();
  }, [newMatchAction]);

  const forfeit = useCallback(() => {
    if (status !== "connected") return;
    if (state.winner !== null || state.matchWinner !== null) return;
    if (!state.active[you]) return;
    if (isHost) { pushLog(`${ident.name} forfeited the round`); hostApplyForfeit(0, false, "forfeit"); }
    else roomRef.current?.send({ type: "forfeit", payload: { from: slotRef.current } });
  }, [isHost, status, state, you, hostApplyForfeit, pushLog, ident.name]);

  const copyCode = useCallback(() => {
    play("click");
    navigator.clipboard?.writeText(code).catch(() => {});
    setToast("Code copied"); window.setTimeout(() => setToast(null), 1400);
  }, [code]);

  // ---------- Sound on round/match transitions ----------
  const prevWinnerRef = useRef<PlayerId | null>(null);
  const prevMatchWinnerRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (state.winner !== null && prevWinnerRef.current === null) {
      const r = state.endReason;
      if (r === "time" || r === "afk" || r === "forfeit") play("afkWarn");
      play("roundWin");
    }
    if (state.matchWinner !== null && prevMatchWinnerRef.current === null) play("matchWin");
    prevWinnerRef.current = state.winner;
    prevMatchWinnerRef.current = state.matchWinner;
  }, [state.winner, state.matchWinner, state.endReason]);

  // ---------- Record match to Supabase (host only, once per match) ----------
  useEffect(() => {
    if (!isHost) return;
    if (state.matchWinner === null) return;
    if (matchRecordedRef.current) return;
    // Never persist a match that never actually got underway. Aborts before
    // any move (e.g. opponent bails during matchmaking, host closes the
    // lobby before the coinflip) should not clutter "recent matches".
    if (!matchStartedRef.current) return;
    if ((state.moveCount ?? 0) === 0) return;
    matchRecordedRef.current = true;
    const r = rosterRef.current;
    const winnerEntry = r.find((e) => e.slot === state.matchWinner);
    void (async () => {
      const matchId = await recordMatch({
        mode: state.mode as 2 | 4,
        rounds: state.totalRounds,
        ranked: !!ranked,
        winnerId: winnerEntry?.playerId ?? null,
        snapshot: matchHistory.getSnapshot(),
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

      // Ranked 1v1 → apply ELO once (host only) using both players' identities,
      // then stamp the match with the rating transferred so history can show
      // the +/- points.
      if (ranked && state.mode === 2) {
        const winner = r.find((e) => e.slot === state.matchWinner);
        const loser = r.find((e) => e.slot !== state.matchWinner);
        if (winner?.playerId && loser?.playerId && winner.playerId !== loser.playerId) {
          const delta = await applyElo1v1(winner.playerId, winner.name, loser.playerId, loser.name);
          if (matchId && typeof delta === "number") {
            await setMatchEloDelta(matchId, delta);
          }
        }
      }
    })();
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
  const [review, setReview] = useState<HistorySnapshot | null>(null);
  const displayState = review
    ? { ...state, pawns: review.pawns, walls: review.walls, lastWall: review.lastWall }
    : state;
  const boardInteractive = status === "connected" && presence.count >= presence.expected && state.winner === null && !coinflip?.animating && !review;

  // Quick / ranked matchmaking: keep the radar visible from the start of
  // the game view until both players are connected AND one full radar
  // cycle has completed, then reveal the board. Private code rooms keep
  // the existing WaitingOverlay because the host still needs to see the
  // room code to share it.
  const usesRadar = !!(quickMatch || ranked);
  const [radarRevealed, setRadarRevealed] = useState(!usesRadar);
  const [waitElapsed, setWaitElapsed] = useState(0);
  useEffect(() => {
    if (!usesRadar) return;
    if (status !== "connected") return;
    if (presence.count < presence.expected) return;
    const t = window.setTimeout(() => setRadarRevealed(true), 1400);
    return () => window.clearTimeout(t);
  }, [usesRadar, status, presence.count, presence.expected]);
  useEffect(() => {
    if (!usesRadar || radarRevealed) return;
    const start = Date.now();
    const id = window.setInterval(() => setWaitElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    const ping = window.setInterval(() => play("searchPing"), 2200);
    return () => { window.clearInterval(id); window.clearInterval(ping); };
  }, [usesRadar, radarRevealed]);

  if (usesRadar && !radarRevealed) {
    const label =
      status === "error" ? "Connection error" :
      status === "disconnected" ? "Disconnected" :
      status === "connected" && presence.count >= presence.expected ? "Match found" :
      status === "connected" ? `Waiting for opponent ${presence.count}/${presence.expected}` :
      status === "waiting" ? `Waiting for opponent ${presence.count}/${presence.expected}` :
      "Connecting";
    const showPuzzle = waitElapsed >= 11;
    return (
      <div className={"w-full " + (showPuzzle ? "" : "flex justify-center")}>
        {showPuzzle ? (
          <div className="mx-auto grid w-full max-w-5xl items-start gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="order-2 md:order-1"><QueuePuzzle /></div>
            <div className="order-1 md:order-2 md:pt-4">
              <SearchingAnimation compact status={label} ranked={!!ranked} mode={state.mode as Mode} onBack={handleLeave} />
            </div>
          </div>
        ) : (
          <SearchingAnimation status={label} ranked={!!ranked} mode={state.mode as Mode} onBack={handleLeave} />
        )}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-6xl gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-1 flex min-w-0 flex-col gap-3 pb-20 lg:pb-0">
        {state.mode === 4 && <ChaosBanner />}
        <TurnBar state={state} you={you} status={status} presence={presence} coinAnimating={!!coinflip?.animating} nameOf={nameOf} />
        {afk && state.winner === null && state.matchWinner === null && (
          <AfkBanner slot={afk.slot} deadline={afk.deadline} name={nameOf(afk.slot)} />
        )}
        <MobileMatchStrip state={state} you={you} nameOf={nameOf} />
        <div className="flex gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <QuoridorBoard state={displayState} you={you} onMove={handleMove} interactive={boardInteractive} onActivity={() => markActivity(you)} />
            {coinflip?.animating && <CoinflipOverlay starter={coinflip.starter} you={you} mode={state.mode as Mode} name={nameOf(coinflip.starter)} />}
            {!usesRadar && status === "waiting" && presence.count < presence.expected && (
              <WaitingOverlay count={presence.count} expected={presence.expected} isHost={isHost} onStart={hostStartMatch} />
            )}
            {status === "error" && <ErrorOverlay msg={errorMsg} onLeave={onLeave} />}
            {status === "disconnected" && !roundOver && (
              <MessageOverlay title="Disconnected" body="Connection to the room was lost." onLeave={onLeave} />
            )}
            {roundOver && !matchOver && !coinflip?.animating && (
              <RoundEndReady
                state={state} you={you} nameOf={nameOf}
                readySlots={readySlots} merging={merging}
                onReady={requestReady} onLeave={onLeave}
              />
            )}
            {matchOver && (
              <div className="pointer-events-none absolute inset-0 rounded-lg bg-background/70 backdrop-blur-sm" />
            )}
          </div>
          <div className="hidden sm:contents">
            <BoardSideClocks state={state} you={you} nameOf={nameOf} />
          </div>
        </div>
      </div>

      {matchOver && (
        <EndScreen state={state} you={you} nameOf={nameOf}
          snapshot={matchHistory.getSnapshot()}
          onRematch={rematchAction}
          onRequeue={onRequeue}
          onNewMatch={onRequeue ?? newMatchAction}
          onLeave={onLeave} />
      )}

      <MobileAsideSheet
        chat={<ChatPanel entries={chat} onSend={sendChat} disabled={status !== "connected" || matchMuted || !!chatBan} you={you} />}
      >
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
        <PlayersCard state={state} you={you} nameOf={nameOf} />
        <MoveHistoryPanel state={state} nameOf={nameOf} compact defaultOpen onView={setReview} />
        <EventLog entries={log} />

        <div className="flex flex-col gap-2">
          <ForfeitButton
            onConfirm={forfeit}
            disabled={status !== "connected" || state.winner !== null || state.matchWinner !== null || !state.active[you]}
          />
          <div className="flex gap-2">
            <button onClick={rematchAction} disabled={status !== "connected" || !!coinflip?.animating}
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary disabled:opacity-40">
              Rematch
            </button>
            <button onClick={handleLeave} className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary">
              Leave
            </button>
          </div>
          {onRequeue && (
            <button onClick={onRequeue}
              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary/20">
              Find new match
            </button>
          )}
        </div>
      </MobileAsideSheet>
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
  const prevScoreRef = useRef<number[]>(state.score);
  const [bumped, setBumped] = useState<number | null>(null);
  useEffect(() => {
    const prev = prevScoreRef.current;
    for (let i = 0; i < state.score.length; i++) {
      if ((prev[i] ?? 0) < (state.score[i] ?? 0)) {
        setBumped(i);
        play("roundWin");
        const id = window.setTimeout(() => setBumped(null), 900);
        prevScoreRef.current = [...state.score];
        return () => window.clearTimeout(id);
      }
    }
    prevScoreRef.current = [...state.score];
  }, [state.score]);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Score</p>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">first to {target}</p>
      </div>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${state.mode}, minmax(0, 1fr))` }}>
        {Array.from({ length: state.mode }, (_, i) => (
          <div key={i} className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-border bg-background/40 px-1.5 py-2">
            <span className="block w-full truncate text-center text-[10px] uppercase tracking-[0.1em]"
              style={{ color: state.matchWinner === i ? PLAYER_COLORS[i] : "var(--muted-foreground)" }}>
              {i === you ? "You" : nameOf(i as PlayerId)}
            </span>
            <span
              key={`${i}-${state.score[i]}`}
              className={
                "grid h-9 w-9 place-items-center rounded-full text-base font-semibold " +
                (bumped === i ? "score-pop" : "")
              }
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
  // Audible low-time cue: soft repeating pulse while the clock is red and
  // this player is on the move. Cadence tightens as time runs out.
  const dangerActive = active && danger && remaining > 0;
  const lastCueRef = useRef(0);
  useEffect(() => {
    if (!dangerActive) { lastCueRef.current = 0; return; }
    const cadence = seconds <= 5 ? 700 : seconds <= 10 ? 1200 : 1800;
    const now = Date.now();
    if (now - lastCueRef.current >= cadence) {
      lastCueRef.current = now;
      play("lowTime");
    }
  }, [dangerActive, seconds]);
  const color = PLAYER_COLORS[playerId];
  const label = nameOf(playerId);
  // One-shot pulse when this clock becomes active (turn change signal)
  const [pulseKey, setPulseKey] = useState(0);
  const wasActiveRef = useRef(active);
  useEffect(() => {
    if (active && !wasActiveRef.current) setPulseKey((k) => k + 1);
    wasActiveRef.current = active;
  }, [active]);
  const cls =
    "rounded-lg border px-3 py-2 transition " +
    (active ? "clock-active " : "opacity-60 ") +
    (active && danger ? "clock-danger " : active && warn ? "clock-warn " : "");
  return (
    <div key={pulseKey ? `p-${pulseKey}` : "p-0"} className={cls + (active ? " clock-turn-pulse" : "")}
      style={{
        borderColor: active ? color : "var(--border)",
        background: active ? `color-mix(in oklab, ${color} 12%, var(--card))` : "var(--card)",
        ["--pulse-color" as string]: color,
      } as React.CSSProperties}>
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
      {active && danger && remaining > 0 && (
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "var(--destructive)" }}>
          {Math.max(1, Math.ceil(seconds))}s left
        </p>
      )}
    </div>
  );
}

function ClocksCard({ state, you, nameOf }: {
  state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string;
}) {
  if (!state.clocks) return null;
  // Chess.com layout: opponent(s) on top, you on bottom. Spectators pass a
  // sentinel `you` that never matches a slot, so we render every clock in
  // the top stack and drop the divider.
  const others: PlayerId[] = [];
  for (let i = 0; i < state.mode; i++) if (i !== you) others.push(i as PlayerId);
  const showYou = you >= 0 && you < state.mode;
  return (
    <div className="flex flex-col gap-2">
      {others.map((o) => (
        <ChessClock key={o} state={state} playerId={o} nameOf={nameOf} compact={state.mode === 4} />
      ))}
      {showYou && (
        <>
          <div className="h-px bg-border/50" />
          <ChessClock state={state} playerId={you} nameOf={nameOf} />
        </>
      )}
    </div>
  );
}

// Vertical clock stack that sits to the right of the board, chess.com style:
// opponents float up top, you sit bottom-right.
function BoardSideClocks({ state, you, nameOf }: {
  state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string;
}) {
  if (!state.clocks) return null;
  const others: PlayerId[] = [];
  for (let i = 0; i < state.mode; i++) if (i !== you) others.push(i as PlayerId);
  const showYou = you >= 0 && you < state.mode;
  return (
    <div className="flex w-20 shrink-0 flex-col justify-between gap-2 sm:w-24 md:w-28">
      <div className="flex flex-col gap-2">
        {others.map((o) => (
          <ChessClock key={o} state={state} playerId={o} nameOf={nameOf} compact />
        ))}
      </div>
      {showYou && (
        <ChessClock state={state} playerId={you} nameOf={nameOf} compact />
      )}
    </div>
  );
}

// Compact mobile-only strip that shows each seat's name, remaining clock,
// and wall count without needing to open the match panel bottom sheet.
function MobileMatchStrip({ state, you, nameOf }: {
  state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!state.clocks) return;
    const iv = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(iv);
  }, [state.clocks]);
  const seats: PlayerId[] = [];
  for (let i = 0; i < state.mode; i++) seats.push(i as PlayerId);
  return (
    <div className="grid gap-1.5 sm:hidden"
      style={{ gridTemplateColumns: `repeat(${state.mode}, minmax(0, 1fr))` }}>
      {seats.map((i) => {
        const color = PLAYER_COLORS[i];
        const isTurn = state.turn === i && state.winner === null && state.matchWinner === null && state.active[i];
        const remaining = state.clocks ? liveRemaining(state.clocks, state.turn, i, now) : 0;
        const seconds = remaining / 1000;
        const danger = seconds <= 15;
        return (
          <div key={i}
            className={"rounded-lg border px-2 py-1.5 transition " + (isTurn ? "clock-active" : "opacity-70")}
            style={{
              borderColor: isTurn ? color : "var(--border)",
              background: isTurn ? `color-mix(in oklab, ${color} 12%, var(--card))` : "var(--card)",
            }}>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {i === you ? "You" : nameOf(i)}
              </span>
            </div>
            {state.clocks && (
              <p className="mt-0.5 font-mono text-base leading-tight tabular-nums"
                style={{ color: danger && isTurn ? "var(--destructive)" : "inherit" }}>
                {formatClock(remaining)}
              </p>
            )}
            <p className="mt-0.5 text-[10px] font-medium tracking-wider text-muted-foreground">
              <span style={{ color }}>{state.wallsLeft[i]}</span> walls
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Round-end "ready up" panel. Each active player is a red ball that turns
// green when they click Ready; once every player is green the balls merge
// into the middle and the next round starts (coinflip runs from the parent).
function RoundEndReady({
  state, you, nameOf, readySlots, merging, onReady, onLeave,
}: {
  state: GameState; you: PlayerId; nameOf: (s: PlayerId) => string;
  readySlots: PlayerId[]; merging: boolean;
  onReady: () => void; onLeave: () => void;
}) {
  const winner = state.winner as PlayerId;
  const youWon = winner === you;
  const players: PlayerId[] = [];
  for (let i = 0; i < state.mode; i++) if (!state.leftMatch[i]) players.push(i as PlayerId);
  const iSeated = you >= 0 && you < state.mode && !state.leftMatch[you];
  const iAmReady = iSeated && readySlots.includes(you);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/75 backdrop-blur-sm">
      <div className="mx-4 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card px-8 py-7 text-center shadow-2xl sm:px-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          {youWon ? "You took the round" : `${nameOf(winner)} took the round`}
        </p>
        <p className="font-display text-lg text-foreground/90">
          {merging ? "Starting next round" : "Ready to continue?"}
        </p>

        <div
          className="relative flex items-center justify-center transition-all duration-700 ease-out"
          style={{
            gap: merging ? "0rem" : "2.25rem",
            transform: merging ? "scale(0.9)" : "scale(1)",
            minHeight: "4.5rem",
          }}
        >
          {players.map((p) => {
            const isReady = readySlots.includes(p);
            const ballColor = isReady ? "oklch(0.72 0.17 145)" : "oklch(0.62 0.2 25)";
            return (
              <div key={p} className="flex flex-col items-center gap-2">
                <span
                  aria-label={isReady ? "Ready" : "Waiting"}
                  className={
                    "block h-16 w-16 rounded-full transition-all duration-500 " +
                    (isReady ? "ready-glow " : "") +
                    (merging ? "ready-merge" : "")
                  }
                  style={{
                    background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${ballColor} 40%, white 60%) 0%, ${ballColor} 55%, color-mix(in oklab, ${ballColor} 55%, black 45%) 100%)`,
                    boxShadow: `0 10px 24px -6px color-mix(in oklab, ${ballColor} 60%, transparent), inset 0 -6px 10px rgba(0,0,0,0.28), inset 0 3px 6px rgba(255,255,255,0.35)`,
                  }}
                />
                <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {p === you ? "You" : "Opponent"}
                </span>
              </div>
            );
          })}
        </div>

        {!merging && (
          <div className="mt-1 flex gap-2">
            <button
              onClick={onReady}
              disabled={!iSeated || iAmReady}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {iAmReady ? "Waiting" : "Ready"}
            </button>
            <button onClick={onLeave} className="rounded-lg border border-border bg-secondary/40 px-6 py-2.5 text-sm font-medium uppercase tracking-widest text-muted-foreground hover:bg-secondary">
              Leave
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WaitingOverlay({ count, expected, isHost, onStart }: { count: number; expected: number; isHost: boolean; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/55 backdrop-blur-[3px]">
      <div className="relative grid h-16 w-16 place-items-center">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border border-emerald-400/50"
            style={{ animation: `qm-ping 2.2s cubic-bezier(0,0,0.2,1) ${i * 1.1}s infinite` }}
          />
        ))}
        <span className="relative z-10 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_4px_rgba(16,185,129,0.6)]" />
      </div>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
        <span className="qm-dots">Waiting for players</span>
      </p>
      <p className="mt-1.5 font-[IBM_Plex_Mono,monospace] text-[11px] text-zinc-300/85 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
        {count}/{expected} connected
      </p>
      {isHost && count >= 2 && count < expected && (
        <button onClick={onStart} className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-950 shadow-[0_15px_40px_-15px_rgba(16,185,129,0.7)]">
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
  const [analyzing, setAnalyzing] = useState(false);
  const winner = (matchOver ? state.matchWinner : state.winner) as PlayerId;
  const youWon = winner === you;
  const winnerColor = PLAYER_COLORS[winner];
  const pieces = Array.from({ length: youWon ? (matchOver ? 90 : 45) : 0 }, (_, i) => i);
  const title = matchOver ? (youWon ? "Match won!" : "Match over") : (youWon ? "Round won" : "Round lost");
  const reason = state.endReason;
  const loser = state.endLoser;
  const loserName = loser !== undefined ? nameOf(loser) : "Opponent";
  const youLost = loser === you;
  const roundSub = (() => {
    if (reason === "time") {
      return youLost
        ? "Your clock hit zero — round lost on time."
        : `${loserName}'s clock hit zero. Round taken on time.`;
    }
    if (reason === "afk") {
      return youLost
        ? "You were idle too long — auto-forfeit on time."
        : `${loserName} went idle and forfeited on time.`;
    }
    if (reason === "forfeit") {
      return youLost
        ? "You forfeited the round."
        : `${loserName} forfeited the round.`;
    }
    if (reason === "left") {
      return youLost
        ? "You left the match."
        : `${loserName} left the match — you win by default.`;
    }
    return youWon ? "You reached your goal." : `${nameOf(winner)} reached their goal first.`;
  })();
  const sub = matchOver
    ? youWon ? `You took the match.` : `${nameOf(winner)} took the match.`
    : roundSub;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-lg bg-background/70 backdrop-blur-sm">
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const dx = (Math.random() - 0.5) * 40;
        const delay = Math.random() * 0.6;
        const dur = 1.6 + Math.random() * 1.4;
        const size = 6 + Math.random() * 8;
        const color = WARM_CONFETTI[i % WARM_CONFETTI.length];
        return (
          <span key={i} className="confetti-piece absolute top-0 block rounded-sm"
            style={{
              left: `${left}%`, width: size, height: size * 1.6, background: color,
              animationDelay: `${delay}s`, animationDuration: `${dur}s`,
              ["--dx" as string]: `${dx}vw`,
            } as React.CSSProperties} />
        );
      })}
      <div className={"results-in relative mx-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6 text-center shadow-2xl sm:mx-0 sm:px-8 sm:py-7"}>
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
          <button onClick={() => setAnalyzing((v) => !v)}
            className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            {analyzing ? "Hide analysis" : "Analyze game"}
          </button>
          <ShareResultButton state={state} you={you} nameOf={nameOf} matchOver={matchOver} />
          <button onClick={onLeave} className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            Leave
          </button>
        </div>
        <MoveHistoryPanel key={analyzing ? "open" : "closed"} state={state} nameOf={nameOf} defaultOpen={analyzing} />
        <SignUpNudge />
      </div>
    </div>
  );
}

function EndScreen({ state, you, onRematch, onNewMatch, onRequeue, onLeave, nameOf, snapshot }: {
  state: GameState; you: PlayerId;
  onRematch: () => void; onNewMatch: () => void; onRequeue?: () => void;
  onLeave: () => void;
  nameOf: (s: PlayerId) => string;
  snapshot: MatchSnapshot | null;
}) {
  const winner = state.matchWinner as PlayerId;
  const youWon = winner === you;
  const winnerColor = PLAYER_COLORS[winner];
  const pieces = useMemo(() => Array.from({ length: youWon ? 100 : 20 }, (_, i) => i), [youWon]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-background/85 px-3 py-6 backdrop-blur-sm">
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const dx = (Math.random() - 0.5) * 40;
        const delay = Math.random() * 0.6;
        const dur = 1.6 + Math.random() * 1.4;
        const size = 6 + Math.random() * 8;
        const color = WARM_CONFETTI[i % WARM_CONFETTI.length];
        return (
          <span key={i} className="confetti-piece absolute top-0 block rounded-sm"
            style={{
              left: `${left}%`, width: size, height: size * 1.6, background: color,
              animationDelay: `${delay}s`, animationDuration: `${dur}s`,
              ["--dx" as string]: `${dx}vw`,
            } as React.CSSProperties} />
        );
      })}
      <div className={"results-in relative my-auto flex max-h-[calc(100dvh-3rem)] w-[min(92vw,520px)] flex-col items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card px-4 py-6 text-center shadow-2xl sm:px-6"}>
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
          <button onClick={onNewMatch} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
            {onRequeue ? "Find new match" : "New match"}
          </button>
          <button onClick={onRematch} className="rounded-lg border border-primary/50 bg-primary/10 px-5 py-2 text-sm font-semibold text-primary transition-transform hover:-translate-y-0.5 hover:bg-primary/20">
            Rematch 🔁
          </button>
          <ShareResultButton state={state} you={you} nameOf={nameOf} matchOver />
          <DownloadGifButton snapshot={snapshot} />
          <AnalyzeGameButton snapshot={snapshot} />
          <button onClick={onLeave} className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary">
            Leave
          </button>
        </div>
        <SignUpNudge />
      </div>
    </div>
  );
}

function ShareResultButton({ state, you, nameOf, matchOver }: {
  state: GameState; you: PlayerId;
  nameOf: (s: PlayerId) => string; matchOver: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "shared" | "downloaded" | "error">(null);
  const onClick = useCallback(async () => {
    const winner = (matchOver ? state.matchWinner : state.winner);
    if (winner === null) return;
    setBusy(true); setDone(null);
    try {
      const blob = await renderResultCard({
        state, you, winner: winner as PlayerId, nameOf,
        reason: state.endReason, matchOver,
      });
      const outcome = await shareResultCard(blob);
      setDone(outcome);
    } catch {
      setDone("error");
    } finally {
      setBusy(false);
      window.setTimeout(() => setDone(null), 2400);
    }
  }, [state, you, nameOf, matchOver]);
  const label = busy ? "Preparing…"
    : done === "shared" ? "Shared!"
    : done === "downloaded" ? "Downloaded"
    : done === "error" ? "Try again"
    : "Share result";
  return (
    <button onClick={onClick} disabled={busy}
      className="rounded-lg border border-border bg-accent/70 px-5 py-2 text-sm font-medium text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70">
      {label}
    </button>
  );
}

function SignUpNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data.user;
      const anon = !u || u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
      setShow(anon);
    });
    return () => { alive = false; };
  }, []);
  if (!show) return null;
  return (
    <div className="mt-3 w-full max-w-md rounded-lg border border-border bg-secondary/30 px-4 py-3 text-center">
      <p className="text-sm font-semibold">Create a free account</p>
      <p className="mt-1 text-xs text-muted-foreground">Save your games, chat in-match, and get a rating.</p>
      <Link to="/auth"
        className="mt-2 inline-block rounded-md bg-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:-translate-y-0.5 transition-transform">
        Sign up
      </Link>
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

function BotGame({ ident, mode, difficulty, opponentNames, onLeave }: {
  ident: Identity;
  mode: Mode;
  difficulty: number;
  opponentNames: string[];
  onLeave: () => void;
}) {
  const YOU: PlayerId = 0;
  const BOT_SLOTS = useMemo<PlayerId[]>(
    () => Array.from({ length: mode - 1 }, (_, i) => (i + 1) as PlayerId),
    [mode],
  );

  const initial = useCallback((): GameState => {
    const s = initialState(mode, defaultWallsFor(mode), 3);
    return { ...s, clocks: initClocks(mode, DEFAULT_CLOCK_MS) };
  }, [mode]);

  const [state, setState] = useState<GameState>(initial);
  const stateRef = useRef(state); stateRef.current = state;
  const [coinflip, setCoinflip] = useState<{ starter: PlayerId; animating: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const botMatchHistory = useMatchHistory(state, Array.from({ length: mode }, (_, i) => (i === YOU ? ident.name : opponentNames[i - 1] ?? `Player ${i + 1}`)));

  // Record bot matches to history so they show up alongside multiplayer games.
  const botRecordedRef = useRef(false);
  useEffect(() => {
    if (state.matchWinner === null) return;
    if (botRecordedRef.current) return;
    if ((state.moveCount ?? 0) === 0) return;
    botRecordedRef.current = true;
    const winnerSlot = state.matchWinner;
    const winnerIsYou = winnerSlot === YOU;
    // Update the caller's aggregate stats (matches/wins/losses/etc.) so bot
    // games count on the profile the same way online games do.
    const walls = state.wallsPlacedByPlayer[YOU] ?? 0;
    const pops = state.pawnsEliminatedByPlayer[YOU] ?? 0;
    const forfeited = state.leftMatch[YOU] ?? false;
    void bumpMyStats(ident.id, {
      matches: 1, wins: winnerIsYou ? 1 : 0, losses: winnerIsYou ? 0 : 1,
      walls_placed: walls, pawns_eliminated: pops, forfeits: forfeited ? 1 : 0,
    });
    void recordMatch({
      mode: mode as 2 | 4,
      rounds: state.totalRounds,
      ranked: false,
      winnerId: winnerIsYou ? ident.id : null,
      snapshot: botMatchHistory.getSnapshot(),
      players: Array.from({ length: mode }, (_, i) => {
        const isYou = i === YOU;
        const botName = opponentNames[i - 1] ?? `Bot ${i}`;
        return {
          id: isYou ? ident.id : null,
          slot: i,
          name: isYou ? ident.name : botName,
          roundsWon: state.score[i] ?? 0,
          wallsPlaced: state.wallsPlacedByPlayer[i] ?? 0,
          pawnsEliminated: state.pawnsEliminatedByPlayer[i] ?? 0,
          forfeited: state.leftMatch[i] ?? false,
        };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.matchWinner]);

  const sendChat = useCallback((text: string) => {
    setChat((prev) => [
      ...prev.slice(-99),
      {
        key: `${Date.now()}-you-${Math.random()}`,
        slot: YOU as number, name: ident.name,
        text, ts: Date.now(),
      },
    ]);
    // Bots don't reply. Give a tiny cue so it's clear it's a solo chat.
  }, [ident.name]);

  // Ready-up between rounds. Bot auto-readies after a short beat.
  const [readySlots, setReadySlots] = useState<PlayerId[]>([]);
  const [merging, setMerging] = useState(false);

  const nameOf = useCallback(
    (s: PlayerId) => {
      if (s === YOU) return ident.name;
      const idx = (s as number) - 1;
      return opponentNames[idx] ?? `Player ${(s as number) + 1}`;
    },
    [ident.name, opponentNames],
  );

  const startCoinflip = useCallback((starter: PlayerId) => {
    setCoinflip({ starter, animating: true });
    play("matchStart");
    window.setTimeout(() => setCoinflip((cf) => (cf ? { ...cf, animating: false } : cf)), 1900);
  }, []);

  const startRound = useCallback((base?: GameState) => {
    const src = base ?? stateRef.current;
    const starter = Math.floor(Math.random() * mode) as PlayerId;
    const ns = newRound(src, starter);
    // Fresh clocks + timestamp starts once the coinflip finishes.
    const withClocks: GameState = {
      ...ns,
      clocks: {
        remaining: Array.from({ length: mode }, () => DEFAULT_CLOCK_MS),
        turnStartedAt: Date.now() + 1900,
        total: DEFAULT_CLOCK_MS,
      },
    };
    setState(withClocks);
    startCoinflip(starter);
  }, [startCoinflip, mode]);

  const startMatch = useCallback(() => {
    startRound(initial());
    const ts = Date.now();
    setChat((prev) => [
      ...prev.slice(-99),
      {
        key: `sys-${ts}-${Math.random()}`,
        slot: null,
        name: "System",
        text: "Be respectful 🙌 — good luck & have fun.",
        ts,
      },
    ]);
  }, [startRound, initial]);

  // Kick off the first round on mount.
  useEffect(() => { startMatch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Sound cues.
  const prevWinnerRef = useRef<PlayerId | null>(null);
  const prevMatchWinnerRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (state.winner !== null && prevWinnerRef.current === null) {
      const r = state.endReason;
      if (r === "time" || r === "afk" || r === "forfeit") play("afkWarn");
      play("roundWin");
    }
    if (state.matchWinner !== null && prevMatchWinnerRef.current === null) play("matchWin");
    prevWinnerRef.current = state.winner;
    prevMatchWinnerRef.current = state.matchWinner;
  }, [state.winner, state.matchWinner, state.endReason]);

  // Helper: apply a move and roll the clock over to the next player.
  const applyLocalMove = useCallback((mover: PlayerId, move: Move): GameState | null => {
    const cur = stateRef.current;
    const ns = applyMove(cur, mover, move);
    if (!ns) return null;
    if (cur.clocks) {
      ns.clocks = endTurn(cur.clocks, mover, Date.now());
    }
    if (ns.winner !== null) {
      ns.endReason = "goal";
      ns.endLoser = ns.winner === mover ? ((mover === YOU ? BOT_SLOTS[0] : YOU) as PlayerId) : (mover as PlayerId);
    }
    return ns;
  }, [BOT_SLOTS]);

  // Bot's turn — think for a human amount of time, then move. Works for
  // any slot that isn't the human (2p or 4p games).
  useEffect(() => {
    if (state.winner !== null || state.matchWinner !== null) return;
    if (coinflip?.animating) return;
    const slot = state.turn as PlayerId;
    if (slot === YOU) return;
    if (!state.active[slot]) return;

    const move = pickBotMove(state, slot, difficulty);
    if (!move) {
      const ns = applyForfeit(state, slot, false);
      if (ns) {
        if (ns.winner !== null) { ns.endReason = "forfeit"; ns.endLoser = slot; }
        setState(ns); play("pop");
      }
      return;
    }
    let delay = humanThinkTimeMs(state, move, difficulty);
    if (state.clocks) {
      const remaining = liveRemaining(state.clocks, state.turn, slot, Date.now());
      delay = Math.min(delay, Math.max(120, remaining - 400));
    }
    const t = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.turn !== slot || cur.winner !== null || cur.matchWinner !== null) return;
      const ns = applyLocalMove(slot, move);
      if (ns) {
        setState(ns);
        play(move.kind === "wall" ? "wall" : "pop");
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
          if (ns.winner !== null) { ns.endReason = "time"; ns.endLoser = loser; }
          setState(ns);
          play("pop");
          setToast(loser === YOU ? "You ran out of time" : `${nameOf(loser)} ran out of time`);
          window.setTimeout(() => setToast(null), 1800);
        }
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [state.clocks, state.winner, state.matchWinner, coinflip?.animating, nameOf]);

  const handleMove = useCallback((move: Move) => {
    initSoundOnGesture();
    const cur = stateRef.current;
    if (cur.turn !== YOU) return;
    const ns = applyLocalMove(YOU, move);
    if (!ns) return;
    play(move.kind === "wall" ? "wall" : "pop");
    setState(ns);
  }, [applyLocalMove]);

  const forfeit = useCallback(() => {
    if (state.winner !== null || state.matchWinner !== null) return;
    if (!state.active[YOU]) return;
    if (!window.confirm("Forfeit this round?")) return;
    const ns = applyForfeit(state, YOU, false);
    if (ns) {
      if (ns.winner !== null) { ns.endReason = "forfeit"; ns.endLoser = YOU; }
      setState(ns); play("pop"); setToast("You forfeited the round"); window.setTimeout(() => setToast(null), 1400);
    }
  }, [state]);

  const nextRound = useCallback(() => {
    if (stateRef.current.matchWinner === null) startRound();
  }, [startRound]);

  const requestReady = useCallback(() => {
    if (stateRef.current.winner === null) return;
    if (stateRef.current.matchWinner !== null) return;
    setReadySlots((prev) => (prev.includes(YOU) ? prev : [...prev, YOU]));
  }, []);

  // Reset ready roster whenever a new round begins.
  const prevWinnerReadyRef = useRef<PlayerId | null>(state.winner);
  useEffect(() => {
    if (prevWinnerReadyRef.current !== null && state.winner === null) {
      setReadySlots([]);
      setMerging(false);
    }
    prevWinnerReadyRef.current = state.winner;
  }, [state.winner]);

  // Bots auto-ready a beat after the round ends so the player never waits
  // on nothing. Each bot picks its own random delay so it feels human.
  useEffect(() => {
    if (state.winner === null || state.matchWinner !== null) return;
    const timers: number[] = [];
    for (const bot of BOT_SLOTS) {
      if (state.leftMatch[bot]) continue;
      if (readySlots.includes(bot)) continue;
      const delay = 1400 + Math.random() * 2200;
      timers.push(window.setTimeout(() => {
        setReadySlots((prev) => (prev.includes(bot) ? prev : [...prev, bot]));
      }, delay));
    }
    return () => { for (const t of timers) window.clearTimeout(t); };
  }, [state.winner, state.matchWinner, state.leftMatch, readySlots, BOT_SLOTS]);

  // When both sides are ready, play the merge animation then start next round.
  const botMergingRef = useRef(false);
  useEffect(() => { botMergingRef.current = merging; }, [merging]);
  useEffect(() => {
    if (state.winner === null || state.matchWinner !== null) return;
    const need: PlayerId[] = [];
    if (!state.leftMatch[YOU]) need.push(YOU);
    for (const bot of BOT_SLOTS) { if (!state.leftMatch[bot]) need.push(bot); }
    if (need.length === 0) return;
    const allReady = need.every((i) => readySlots.includes(i));
    if (!allReady || botMergingRef.current) return;
    setMerging(true);
    const t = window.setTimeout(() => { nextRound(); }, 900);
    return () => window.clearTimeout(t);
  }, [state.winner, state.matchWinner, state.leftMatch, readySlots, nextRound, BOT_SLOTS]);

  const roundOver = state.winner !== null;
  const matchOver = state.matchWinner !== null;
  const [review, setReview] = useState<HistorySnapshot | null>(null);
  const displayState = review
    ? { ...state, pawns: review.pawns, walls: review.walls, lastWall: review.lastWall }
    : state;
  const boardInteractive = state.winner === null && !coinflip?.animating && state.turn === YOU && !review;

  return (
    <div className="grid w-full max-w-6xl gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-1 flex min-w-0 flex-col gap-3 pb-20 lg:pb-0">
        <TurnBar
          state={state} you={YOU} status={"connected"}
          presence={{ count: mode, expected: mode }}
          coinAnimating={!!coinflip?.animating} nameOf={nameOf}
        />
        <div className="flex gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <QuoridorBoard state={displayState} you={YOU} onMove={handleMove} interactive={boardInteractive} />
            {coinflip?.animating && (
              <CoinflipOverlay starter={coinflip.starter} you={YOU} mode={mode} name={nameOf(coinflip.starter)} />
            )}
            {roundOver && !matchOver && !coinflip?.animating && (
              <RoundEndReady
                state={state} you={YOU} nameOf={nameOf}
                readySlots={readySlots} merging={merging}
                onReady={requestReady} onLeave={onLeave}
              />
            )}
            {matchOver && (
              <div className="pointer-events-none absolute inset-0 rounded-lg bg-background/70 backdrop-blur-sm" />
            )}
          </div>
          <BoardSideClocks state={state} you={YOU} nameOf={nameOf} />
        </div>
      </div>

      {matchOver && (
        <EndScreen state={state} you={YOU} nameOf={nameOf}
          snapshot={botMatchHistory.getSnapshot()}
          onRematch={startMatch} onNewMatch={startMatch} onLeave={onLeave} />
      )}

      <MobileAsideSheet chat={<ChatPanel entries={chat} onSend={sendChat} you={YOU} />}>
        <ScoreCard state={state} you={YOU} nameOf={nameOf} />
        <PlayersCard state={state} you={YOU} nameOf={nameOf} />
        <MoveHistoryPanel state={state} nameOf={nameOf} compact defaultOpen onView={setReview} />

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
      </MobileAsideSheet>
    </div>
  );
}

// ---------------- SPECTATE ----------------

function SpectateRoom({ onBack, onJoin }: { onBack: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button onClick={onBack} className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">← Back</button>
      <h2 className="mt-3 text-2xl">Spectate a match</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the code of a match already in progress. You'll watch the board update live — no seat, no wall placement, just the show.
      </p>
      <input
        value={clean}
        onChange={(e) => setCode(e.target.value)}
        placeholder="K7M2Q"
        autoFocus
        className="mt-6 w-full rounded-lg border border-border bg-background/40 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] text-primary focus:border-primary focus:outline-none"
      />
      <button
        disabled={clean.length !== 5}
        onClick={() => onJoin(clean)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Watch →
      </button>
    </div>
  );
}

type SpectateStatus = "connecting" | "waiting" | "watching" | "disconnected" | "error";

function SpectatorGame({ ident, code, onLeave }: {
  ident: Identity; code: string; onLeave: () => void;
}) {
  // Spectator has no seat. Use -1 (cast) so no "you" logic ever matches.
  const SPECTATOR_YOU = -1 as unknown as PlayerId;

  const [status, setStatus] = useState<SpectateStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(2);
  const [state, setState] = useState<GameState | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [coinflip, setCoinflip] = useState<{ starter: PlayerId; animating: boolean } | null>(null);
  const [log, setLog] = useState<EventEntry[]>([]);
  const [afk, setAfk] = useState<{ slot: PlayerId; deadline: number } | null>(null);

  const roomRef = useRef<Room | null>(null);

  const nameOf = useCallback((s: PlayerId): string => {
    const r = roster.find((x) => x.slot === s);
    return r?.name ?? `Player ${s + 1}`;
  }, [roster]);

  const pushLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-30), { key: Date.now() + Math.random(), text }]);
  }, []);

  const startCoinflip = useCallback((starter: PlayerId) => {
    setCoinflip({ starter, animating: true });
    play("matchStart");
    window.setTimeout(() => setCoinflip((cf) => (cf ? { ...cf, animating: false } : cf)), 2000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handlers = {
      onOpen: () => { if (!cancelled) setStatus("connecting"); },
      onSpectateAssign: (m: Mode, _expected: number, r: RosterEntry[]) => {
        if (cancelled) return;
        setMode(m);
        setRoster(r);
        // If host hasn't sent state yet, we're between matches; otherwise
        // the state replay that follows will flip us into "watching".
        setStatus((s) => (s === "connecting" ? "waiting" : s));
      },
      onPresence: (_c: number, _e: number, r: RosterEntry[]) => {
        if (cancelled) return;
        setRoster(r);
      },
      onDisconnect: () => { if (!cancelled) setStatus("disconnected"); },
      onError: (err: Error) => {
        if (cancelled) return;
        console.error(err);
        // "peer-unavailable" from PeerJS = the room code isn't hosting anyone.
        const msg = /peer-unavailable/i.test(err.message)
          ? "No match found with that code."
          : err.message || "Connection error";
        setErrorMsg(msg);
        setStatus("error");
      },
      onMessage: (msg: PeerMessage) => {
        if (cancelled) return;
        if (msg.type === "state") {
          setState(msg.payload as GameState);
          setStatus("watching");
        } else if (msg.type === "coinflip") {
          startCoinflip((msg.payload as { starter: number }).starter as PlayerId);
        } else if (msg.type === "log") {
          pushLog((msg.payload as { text: string }).text);
        } else if (msg.type === "afk") {
          const p = msg.payload as { slot: number; deadline: number };
          setAfk({ slot: p.slot as PlayerId, deadline: p.deadline });
        } else if (msg.type === "afkCancel") {
          setAfk(null);
        }
      },
    };

    (async () => {
      try {
        const room = await createSpectatorRoom(
          code,
          { name: ident.name, playerId: ident.id },
          handlers,
        );
        if (cancelled) { room.close(); return; }
        roomRef.current = room;
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setErrorMsg((err as Error).message || "Failed to connect");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      roomRef.current?.close();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="grid w-full max-w-6xl gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-1 flex min-w-0 flex-col gap-3 pb-20 lg:pb-0">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <span className="grid h-9 w-9 place-items-center rounded-full text-[10px] font-semibold uppercase tracking-widest"
            style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
            Live
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-semibold">
              {status === "connecting" && "Connecting to match…"}
              {status === "waiting" && "Waiting for the next move…"}
              {status === "watching" && state && (
                coinflip?.animating
                  ? "Flipping the coin…"
                  : state.matchWinner !== null ? `${nameOf(state.matchWinner)} won the match`
                  : state.winner !== null ? `${nameOf(state.winner)} took the round`
                  : `${nameOf(state.turn)}'s turn`
              )}
              {status === "disconnected" && "Match ended · host disconnected"}
              {status === "error" && (errorMsg ?? "Couldn't join")}
            </p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Spectating · room {code}
            </p>
          </div>
        </div>

        {afk && state && (
          <AfkBanner slot={afk.slot} deadline={afk.deadline} name={nameOf(afk.slot)} />
        )}

        <div className="flex gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            {state ? (
              <QuoridorBoard
                state={state}
                you={SPECTATOR_YOU}
                onMove={() => { /* read-only */ }}
                interactive={false}
              />
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-border bg-card/50 text-sm text-muted-foreground">
                {status === "error" ? (errorMsg ?? "No match here") : "Waiting for the match…"}
              </div>
            )}
            {state && coinflip?.animating && (
              <CoinflipOverlay
                starter={coinflip.starter}
                you={SPECTATOR_YOU}
                mode={state.mode as Mode}
                name={nameOf(coinflip.starter)}
              />
            )}
          </div>
          {state && <BoardSideClocks state={state} you={SPECTATOR_YOU} nameOf={nameOf} />}
        </div>
      </div>

      <MobileAsideSheet>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Spectating</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-mono text-xl tracking-[0.3em] text-primary sm:text-2xl">{code}</p>
            <span className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              {mode}p
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Read-only view. You can watch but not play.
          </p>
        </div>

        {state && <ScoreCard state={state} you={SPECTATOR_YOU} nameOf={nameOf} />}
        {state && <PlayersCard state={state} you={SPECTATOR_YOU} nameOf={nameOf} />}
        <EventLog entries={log} />

        <button
          onClick={onLeave}
          className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
        >
          Leave
        </button>
      </MobileAsideSheet>
    </div>
  );
}
