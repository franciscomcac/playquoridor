import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { PLAYER_COLORS, PLAYER_NAMES, QuoridorBoard } from "@/components/QuoridorBoard";
import {
  applyForfeit,
  applyMove,
  defaultWallsFor,
  initialState,
  newRound,
  winsNeeded,
  type GameState,
  type Mode,
  type Move,
  type PlayerId,
} from "@/lib/quoridor";
import {
  createGuestRoom,
  createHostRoom,
  makeRoomCode,
  type PeerMessage,
  type Room,
} from "@/lib/peer-room";

export const Route = createFileRoute("/")({
  component: Home,
});

type View =
  | { name: "menu" }
  | { name: "create"; mode: Mode; walls: number; rounds: number }
  | { name: "join" }
  | {
      name: "game";
      isHost: boolean;
      code: string;
      mode: Mode;
      walls: number;
      rounds: number;
    };

function Home() {
  const [view, setView] = useState<View>({ name: "menu" });
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <Header />
        <div className="flex flex-1 items-center justify-center py-6">
          {view.name === "menu" && <Menu onChoose={setView} />}
          {view.name === "create" && (
            <CreateRoom
              mode={view.mode}
              walls={view.walls}
              rounds={view.rounds}
              setMode={(m) =>
                setView({ ...view, mode: m, walls: defaultWallsFor(m) })
              }
              setWalls={(w) => setView({ ...view, walls: w })}
              setRounds={(r) => setView({ ...view, rounds: r })}
              onBack={() => setView({ name: "menu" })}
              onStart={(code) =>
                setView({
                  name: "game",
                  isHost: true,
                  code,
                  mode: view.mode,
                  walls: view.walls,
                  rounds: view.rounds,
                })
              }
            />
          )}
          {view.name === "join" && (
            <JoinRoom
              onBack={() => setView({ name: "menu" })}
              onJoin={(code) =>
                setView({
                  name: "game",
                  isHost: false,
                  code,
                  mode: 2,
                  walls: 10,
                  rounds: 5,
                })
              }
            />
          )}
          {view.name === "game" && (
            <GameScreen
              key={view.code + (view.isHost ? "-h" : "-g")}
              code={view.code}
              isHost={view.isHost}
              mode={view.mode}
              initialWalls={view.walls}
              initialRounds={view.rounds}
              onLeave={() => setView({ name: "menu" })}
            />
          )}
        </div>
        <Footer />
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-md"
          style={{
            background: "linear-gradient(145deg, oklch(0.36 0.05 55), oklch(0.18 0.03 45))",
            boxShadow: "inset 0 1px 0 oklch(0.55 0.08 60 / 0.45), 0 6px 14px -6px oklch(0 0 0 / 0.6)",
          }}
        >
          <span className="block h-4 w-4 rounded-full" style={{ background: "var(--primary)" }} />
        </span>
        <div>
          <p className="text-xl font-semibold leading-none">Quoridor Parlour</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Peer to peer · 2 or 4 players
          </p>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="pt-6 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
      Peer-to-peer · no accounts · your browser only
    </footer>
  );
}

function Menu({ onChoose }: { onChoose: (v: View) => void }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
      <h1 className="text-4xl">A quiet game of Quoridor.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Create a room and share a code, or join one a friend sent you. No accounts,
        no waiting — just a board.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={() => onChoose({ name: "create", mode: 2, walls: 10, rounds: 5 })}
          className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Create a room
        </button>
        <button
          onClick={() => onChoose({ name: "join" })}
          className="rounded-lg border border-border bg-secondary/40 px-5 py-3 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Join with code
        </button>
      </div>
    </div>
  );
}

function CreateRoom({
  mode,
  walls,
  rounds,
  setMode,
  setWalls,
  setRounds,
  onBack,
  onStart,
}: {
  mode: Mode;
  walls: number;
  rounds: number;
  setMode: (m: Mode) => void;
  setWalls: (n: number) => void;
  setRounds: (n: number) => void;
  onBack: () => void;
  onStart: (code: string) => void;
}) {
  const [code] = useState(() => makeRoomCode());
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button
        onClick={onBack}
        className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Create a room</h2>
      <p className="mt-1 text-sm text-muted-foreground">Pick players, walls, and match length.</p>

      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Players</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[2, 4].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m as Mode)}
              className={
                "rounded-lg border px-4 py-3 text-sm font-medium transition-colors " +
                (mode === m
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground")
              }
            >
              {m} Players
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <label className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Walls per player <span className="text-base font-semibold text-foreground">{walls}</span>
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={walls}
          onChange={(e) => setWalls(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--primary)]"
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0</span>
          <span>{defaultWallsFor(mode)} standard</span>
          <span>20</span>
        </div>
      </div>

      <div className="mt-6">
        <label className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Rounds{" "}
          <span className="text-base font-semibold text-foreground">
            {rounds === 1 ? "single game" : `best of ${rounds} · first to ${winsNeeded(rounds)}`}
          </span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={rounds}
          onChange={(e) => setRounds(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--primary)]"
        />
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-border bg-background/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Room code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-mono text-3xl tracking-[0.3em] text-primary">{code}</p>
          <button
            onClick={copy}
            className="rounded-md border border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <button
        onClick={() => onStart(code)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
      >
        Open room →
      </button>
    </div>
  );
}

function JoinRoom({
  onBack,
  onJoin,
}: {
  onBack: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button
        onClick={onBack}
        className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Join a room</h2>
      <p className="mt-1 text-sm text-muted-foreground">Enter the 5-character room code.</p>
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
        Join →
      </button>
    </div>
  );
}

type Status = "connecting" | "waiting" | "connected" | "disconnected" | "error";

function GameScreen({
  code,
  isHost,
  mode: initialMode,
  initialWalls,
  initialRounds,
  onLeave,
}: {
  code: string;
  isHost: boolean;
  mode: Mode;
  initialWalls: number;
  initialRounds: number;
  onLeave: () => void;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [presence, setPresence] = useState<{ count: number; expected: number }>({
    count: 1,
    expected: initialMode,
  });
  const [slot, setSlot] = useState<PlayerId>(0);
  const slotRef = useRef<PlayerId>(0);
  slotRef.current = slot;

  const [state, setState] = useState<GameState>(() =>
    initialState(initialMode, initialWalls, initialRounds),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const [coinflip, setCoinflip] = useState<{ starter: PlayerId; animating: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  const startCoinflip = useCallback((starter: PlayerId) => {
    setCoinflip({ starter, animating: true });
    window.setTimeout(
      () => setCoinflip((cf) => (cf ? { ...cf, animating: false } : cf)),
      2000,
    );
  }, []);

  const hostStartRound = useCallback(
    (base?: GameState) => {
      const src = base ?? stateRef.current;
      const starter = Math.floor(Math.random() * src.mode) as PlayerId;
      const ns = newRound(src, starter);
      setState(ns);
      roomRef.current?.send({ type: "state", payload: ns });
      roomRef.current?.send({ type: "coinflip", payload: { starter } });
      startCoinflip(starter);
    },
    [startCoinflip],
  );

  const hostStartMatch = useCallback(() => {
    const { totalWalls, totalRounds, mode } = stateRef.current;
    hostStartRound(initialState(mode, totalWalls, totalRounds));
  }, [hostStartRound]);

  const hostApplyForfeit = useCallback((who: PlayerId) => {
    const ns = applyForfeit(stateRef.current, who);
    if (!ns) return;
    setState(ns);
    roomRef.current?.send({ type: "state", payload: ns });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handlers = {
      onOpen: () => {
        if (cancelled) return;
        setStatus("waiting");
      },
      onPresence: (count: number, expected: number) => {
        if (cancelled) return;
        setPresence({ count, expected });
      },
      onAssign: (s: number, m: Mode, expected: number) => {
        if (cancelled) return;
        setSlot(s as PlayerId);
        setPresence((p) => ({ count: p.count, expected }));
        setState((prev) =>
          prev.mode === m ? prev : initialState(m, initialWalls, initialRounds),
        );
      },
      onFull: () => {
        if (cancelled) return;
        setStatus("connected");
        if (isHost) hostStartMatch();
      },
      onDisconnect: () => {
        if (cancelled) return;
        setStatus("disconnected");
      },
      onMessage: (msg: PeerMessage) => {
        if (cancelled) return;
        if (msg.type === "state") {
          setState(msg.payload as GameState);
          setStatus("connected");
        } else if (msg.type === "move" && isHost) {
          const p = msg.payload as { from: PlayerId; move: Move };
          const next = applyMove(stateRef.current, p.from, p.move);
          if (next) {
            setState(next);
            roomRef.current?.send({ type: "state", payload: next });
          }
        } else if (msg.type === "forfeit" && isHost) {
          const p = msg.payload as { from: PlayerId };
          hostApplyForfeit(p.from);
        } else if (msg.type === "nextRound" && isHost) {
          if (stateRef.current.matchWinner === null) hostStartRound();
        } else if (msg.type === "newMatch" && isHost) {
          hostStartMatch();
        } else if (msg.type === "coinflip") {
          const p = msg.payload as { starter: number };
          startCoinflip(p.starter as PlayerId);
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
          ? await createHostRoom(code, initialMode, handlers)
          : await createGuestRoom(code, handlers);
        if (cancelled) {
          room.close();
          return;
        }
        roomRef.current = room;
      } catch (err) {
        handlers.onError(err as Error);
      }
    };
    boot();
    return () => {
      cancelled = true;
      roomRef.current?.close();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isHost, initialMode]);

  const you = slot;

  const handleMove = useCallback(
    (move: Move) => {
      if (status !== "connected") return;
      if (isHost) {
        const next = applyMove(stateRef.current, 0, move);
        if (next) {
          setState(next);
          roomRef.current?.send({ type: "state", payload: next });
        }
      } else {
        roomRef.current?.send({
          type: "move",
          payload: { from: slotRef.current, move },
        });
      }
    },
    [isHost, status],
  );

  const nextRound = useCallback(() => {
    if (isHost) {
      if (stateRef.current.matchWinner === null) hostStartRound();
    } else {
      roomRef.current?.send({ type: "nextRound", payload: {} });
    }
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
    if (isHost) hostApplyForfeit(0);
    else
      roomRef.current?.send({
        type: "forfeit",
        payload: { from: slotRef.current },
      });
  }, [isHost, status, state, you, hostApplyForfeit]);

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setToast("Code copied");
    window.setTimeout(() => setToast(null), 1400);
  }, [code]);

  const roundOver = state.winner !== null;
  const matchOver = state.matchWinner !== null;
  const boardInteractive =
    status === "connected" && state.winner === null && !coinflip?.animating;

  return (
    <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
        <TurnBar
          state={state}
          you={you}
          status={status}
          presence={presence}
          coinAnimating={!!coinflip?.animating}
        />
        <div className="relative">
          <QuoridorBoard
            state={state}
            you={you}
            onMove={handleMove}
            interactive={boardInteractive}
          />
          {coinflip?.animating && (
            <CoinflipOverlay starter={coinflip.starter} you={you} />
          )}
          {status === "waiting" && presence.count < presence.expected && (
            <WaitingOverlay count={presence.count} expected={presence.expected} />
          )}
          {status === "error" && <ErrorOverlay msg={errorMsg} onLeave={onLeave} />}
          {status === "disconnected" && !roundOver && (
            <MessageOverlay
              title="Disconnected"
              body="A player left the game."
              onLeave={onLeave}
            />
          )}
          {roundOver && (
            <WinOverlay
              state={state}
              you={you}
              matchOver={matchOver}
              onPrimary={matchOver ? newMatchAction : nextRound}
              primaryLabel={matchOver ? "New match" : "Next round"}
              onLeave={onLeave}
            />
          )}
        </div>
      </div>

      <aside className="order-1 flex flex-col gap-3 lg:order-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Room code</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-mono text-2xl tracking-[0.3em] text-primary">{code}</p>
            <button
              onClick={copyCode}
              className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isHost ? "Share this code." : "Connected to host."} · {presence.count}/{presence.expected} in
          </p>
          {toast && (
            <p className="toast-in mt-2 text-[10px] uppercase tracking-widest text-primary">
              {toast}
            </p>
          )}
        </div>

        <ScoreCard state={state} you={you} />
        <PlayersCard state={state} you={you} />

        <div className="flex flex-col gap-2">
          <button
            onClick={forfeit}
            disabled={
              status !== "connected" ||
              state.winner !== null ||
              state.matchWinner !== null ||
              !state.active[you]
            }
            className="rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary/50 disabled:opacity-40"
            style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
          >
            Forfeit round
          </button>
          <div className="flex gap-2">
            <button
              onClick={newMatchAction}
              disabled={status !== "connected" || !!coinflip?.animating}
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary disabled:opacity-40"
            >
              New match
            </button>
            <button
              onClick={onLeave}
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
            >
              Leave
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function TurnBar({
  state,
  you,
  status,
  presence,
  coinAnimating,
}: {
  state: GameState;
  you: PlayerId;
  status: Status;
  presence: { count: number; expected: number };
  coinAnimating: boolean;
}) {
  const active = state.turn;
  const yourTurn =
    state.turn === you && state.winner === null && state.active[you];
  const highlight =
    state.matchWinner !== null
      ? state.matchWinner
      : state.winner !== null
        ? state.winner
        : active;
  const color = PLAYER_COLORS[highlight];
  const label =
    status !== "connected"
      ? `Waiting… ${presence.count}/${presence.expected}`
      : coinAnimating
        ? "Flipping the coin…"
        : state.matchWinner !== null
          ? `${highlight === you ? "You" : PLAYER_NAMES[state.matchWinner]} won the match`
          : state.winner !== null
            ? `${highlight === you ? "You" : PLAYER_NAMES[state.winner]} took the round`
            : yourTurn
              ? "Your turn"
              : `${PLAYER_NAMES[active]}'s turn`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <span
        className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold"
        style={{
          background: color,
          color: "oklch(0.15 0.02 55)",
          boxShadow: `0 0 14px color-mix(in oklab, ${color} 55%, transparent)`,
        }}
      >
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

function ScoreCard({ state, you }: { state: GameState; you: PlayerId }) {
  const target = winsNeeded(state.totalRounds);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Score</p>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          first to {target}
        </p>
      </div>
      <div
        className="mt-3 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${state.mode}, 1fr)` }}
      >
        {Array.from({ length: state.mode }, (_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-2"
          >
            <span
              className="text-[10px] uppercase tracking-[0.15em]"
              style={{
                color:
                  state.matchWinner === i
                    ? PLAYER_COLORS[i]
                    : "var(--muted-foreground)",
              }}
            >
              {i === you ? "You" : PLAYER_NAMES[i]}
            </span>
            <span
              className="grid h-10 w-10 place-items-center rounded-full text-lg font-semibold"
              style={{
                background: PLAYER_COLORS[i],
                color: "oklch(0.15 0.02 55)",
                boxShadow:
                  state.matchWinner === i
                    ? `0 0 0 3px color-mix(in oklab, ${PLAYER_COLORS[i]} 45%, transparent)`
                    : "0 1px 3px rgba(0,0,0,0.4)",
              }}
            >
              {state.score[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayersCard({ state, you }: { state: GameState; you: PlayerId }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Players</p>
      <div className="mt-3 flex flex-col gap-3">
        {state.pawns.map((_, i) => {
          const isActiveTurn =
            state.turn === i && state.winner === null && state.active[i];
          const eliminated = !state.active[i];
          const color = PLAYER_COLORS[i];
          return (
            <div key={i} className="flex items-center gap-3">
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold"
                style={{
                  background: color,
                  color: "oklch(0.15 0.02 55)",
                  boxShadow: isActiveTurn
                    ? `0 0 0 3px color-mix(in oklab, ${color} 45%, transparent)`
                    : "none",
                  opacity: eliminated ? 0.4 : 1,
                }}
              >
                {i + 1}
              </span>
              <span
                className="flex-1 truncate text-sm"
                style={{ opacity: eliminated ? 0.5 : 1 }}
              >
                {i === you ? "You" : PLAYER_NAMES[i]}{" "}
                <span className="text-muted-foreground">({PLAYER_NAMES[i]})</span>
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
        <span
          key={i}
          className="block h-3 w-1.5 rounded-sm"
          style={{ background: i < shown ? color : "var(--border)" }}
        />
      ))}
      {count > 10 && (
        <span className="ml-1 text-[10px] text-muted-foreground">+{count - 10}</span>
      )}
    </div>
  );
}

function CoinflipOverlay({
  starter,
  you,
}: {
  starter: PlayerId;
  you: PlayerId;
}) {
  const youStart = starter === you;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm">
      <div
        className="coin-spin coin-hue grid h-28 w-28 place-items-center rounded-full text-3xl font-bold shadow-2xl"
        style={{
          background:
            "conic-gradient(from 0deg, oklch(0.82 0.16 85), oklch(0.62 0.14 250), oklch(0.6 0.2 25), oklch(0.66 0.14 155), oklch(0.82 0.16 85))",
          color: "oklch(0.15 0.02 55)",
        }}
      >
        <span style={{ textShadow: "0 2px 6px rgba(0,0,0,0.35)" }}>?</span>
      </div>
      <p className="mt-4 text-sm uppercase tracking-[0.25em] text-foreground">
        Coin flip…
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {youStart ? "You move first" : `${PLAYER_NAMES[starter]} moves first`}
      </p>
    </div>
  );
}

function WaitingOverlay({
  count,
  expected,
}: {
  count: number;
  expected: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
      <div className="spinner h-12 w-12 rounded-full border-2 border-primary border-t-transparent" />
      <p className="mt-4 text-sm uppercase tracking-[0.25em] text-foreground">
        Waiting for players…
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {count}/{expected} connected
      </p>
    </div>
  );
}

function ErrorOverlay({
  msg,
  onLeave,
}: {
  msg: string | null;
  onLeave: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/90 p-6 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        {msg ?? "Unknown error"}
      </p>
      <button
        onClick={onLeave}
        className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
      >
        Back to menu
      </button>
    </div>
  );
}

function MessageOverlay({
  title,
  body,
  onLeave,
}: {
  title: string;
  body: string;
  onLeave: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/85 p-6 text-center">
      <p className="text-2xl">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <button
        onClick={onLeave}
        className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
      >
        Back to menu
      </button>
    </div>
  );
}

function WinOverlay({
  state,
  you,
  matchOver,
  onPrimary,
  primaryLabel,
  onLeave,
}: {
  state: GameState;
  you: PlayerId;
  matchOver: boolean;
  onPrimary: () => void;
  primaryLabel: string;
  onLeave: () => void;
}) {
  const winner = (matchOver ? state.matchWinner : state.winner) as PlayerId;
  const youWon = winner === you;
  const winnerColor = PLAYER_COLORS[winner];
  const pieces = Array.from(
    { length: youWon ? (matchOver ? 90 : 45) : 0 },
    (_, i) => i,
  );
  const title = matchOver
    ? youWon
      ? "Match won!"
      : "Match over"
    : youWon
      ? "Round won"
      : "Round lost";
  const otherBest = Math.max(
    ...state.score.map((s, i) => (i === you ? -1 : s)),
  );
  const sub = matchOver
    ? youWon
      ? `You took the match ${state.score[you]}–${Math.max(0, otherBest)}.`
      : `${PLAYER_NAMES[winner]} took the match.`
    : youWon
      ? "You reached your goal."
      : `${PLAYER_NAMES[winner]} reached their goal first.`;

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
          <span
            key={i}
            className="confetti-piece absolute top-0 block rounded-sm"
            style={
              {
                left: `${left}%`,
                width: size,
                height: size * 1.6,
                background: color,
                animationDelay: `${delay}s`,
                animationDuration: `${dur}s`,
                ["--dx" as string]: `${dx}vw`,
              } as React.CSSProperties
            }
          />
        );
      })}
      <div
        className={
          (youWon ? "win-pop" : "lose-fade") +
          " relative flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-7 text-center shadow-2xl"
        }
      >
        <span
          className="grid h-14 w-14 place-items-center rounded-full text-xl font-semibold"
          style={{
            background: winnerColor,
            color: "oklch(0.15 0.02 55)",
            boxShadow: `0 0 26px color-mix(in oklab, ${winnerColor} 60%, transparent)`,
          }}
        >
          {winner + 1}
        </span>
        <p className="text-3xl">{title}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{sub}</p>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {state.score
            .map((s, i) => (i === you ? `You ${s}` : `${PLAYER_NAMES[i]} ${s}`))
            .join(" · ")}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={onPrimary}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {primaryLabel}
          </button>
          <button
            onClick={onLeave}
            className="rounded-lg border border-border bg-secondary/40 px-5 py-2 text-sm font-medium hover:bg-secondary"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}