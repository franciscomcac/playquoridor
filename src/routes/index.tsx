import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuoridorBoard } from "@/components/QuoridorBoard";
import {
  applyMove,
  initialState,
  type GameState,
  type Move,
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
  | { name: "create"; walls: number }
  | { name: "join" }
  | {
      name: "game";
      isHost: boolean;
      code: string;
      walls: number;
    };

function Home() {
  const [view, setView] = useState<View>({ name: "menu" });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <Header />
        <div className="flex flex-1 items-center justify-center py-10">
          {view.name === "menu" && <Menu onChoose={setView} />}
          {view.name === "create" && (
            <CreateRoom
              walls={view.walls}
              setWalls={(w) => setView({ name: "create", walls: w })}
              onBack={() => setView({ name: "menu" })}
              onStart={(code) =>
                setView({ name: "game", isHost: true, code, walls: view.walls })
              }
            />
          )}
          {view.name === "join" && (
            <JoinRoom
              onBack={() => setView({ name: "menu" })}
              onJoin={(code) =>
                setView({ name: "game", isHost: false, code, walls: 10 })
              }
            />
          )}
          {view.name === "game" && (
            <GameScreen
              key={view.code + (view.isHost ? "-h" : "-g")}
              code={view.code}
              isHost={view.isHost}
              initialWalls={view.walls}
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
          className="grid h-9 w-9 place-items-center rounded-md"
          style={{ background: "var(--wall)" }}
        >
          <span
            className="block h-4 w-4 rounded-full"
            style={{ background: "var(--background)" }}
          />
        </span>
        <div>
          <p
            className="text-xl font-semibold leading-none"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Quoridor Parlour
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Play with a friend
          </p>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="pt-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      Peer-to-peer · no accounts · your browser only
    </footer>
  );
}

function Menu({ onChoose }: { onChoose: (v: View) => void }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-3xl">A quiet game of Quoridor.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create a room and share the code with a friend, or join one they've sent you.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onChoose({ name: "create", walls: 10 })}
          className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Create a room
        </button>
        <button
          type="button"
          onClick={() => onChoose({ name: "join" })}
          className="rounded-lg border border-border bg-background px-5 py-3 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Join with code
        </button>
      </div>
    </div>
  );
}

function CreateRoom({
  walls,
  setWalls,
  onBack,
  onStart,
}: {
  walls: number;
  setWalls: (n: number) => void;
  onBack: () => void;
  onStart: (code: string) => void;
}) {
  const [code] = useState(() => makeRoomCode());
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Create a room</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose how many walls each player gets, then share the code.
      </p>

      <div className="mt-6">
        <label className="flex items-baseline justify-between text-xs uppercase tracking-[0.15em] text-muted-foreground">
          Walls per player
          <span className="text-base font-semibold text-foreground">{walls}</span>
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={walls}
          onChange={(e) => setWalls(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--accent)]"
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0 (pure race)</span>
          <span>10 (standard)</span>
          <span>20 (fortress)</span>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-border bg-background p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Room code</p>
        <p
          className="mt-1 font-mono text-3xl tracking-[0.3em]"
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          {code}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onStart(code)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
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
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <h2 className="mt-3 text-2xl">Join a room</h2>
      <p className="mt-1 text-sm text-muted-foreground">Enter the 5-character room code.</p>
      <input
        value={clean}
        onChange={(e) => setCode(e.target.value)}
        placeholder="e.g. K7M2Q"
        autoFocus
        className="mt-6 w-full rounded-lg border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] uppercase focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        disabled={clean.length !== 5}
        onClick={() => onJoin(clean)}
        className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
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
  initialWalls,
  onLeave,
}: {
  code: string;
  isHost: boolean;
  initialWalls: number;
  onLeave: () => void;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [state, setState] = useState<GameState>(() => initialState(initialWalls));
  const stateRef = useRef(state);
  stateRef.current = state;

  const roomRef = useRef<Room | null>(null);
  const you: 0 | 1 = isHost ? 0 : 1;

  useEffect(() => {
    let cancelled = false;

    const handlers = {
      onOpen: () => {
        if (cancelled) return;
        setStatus(isHost ? "waiting" : "connecting");
      },
      onConnect: () => {
        if (cancelled) return;
        setStatus("connected");
        if (isHost) {
          roomRef.current?.send({ type: "state", payload: stateRef.current });
        }
      },
      onDisconnect: () => {
        if (cancelled) return;
        setStatus("disconnected");
      },
      onMessage: (msg: PeerMessage) => {
        if (cancelled) return;
        if (msg.type === "state") {
          setState(msg.payload as GameState);
        } else if (msg.type === "move" && isHost) {
          const next = applyMove(stateRef.current, 1, msg.payload as Move);
          if (next) {
            setState(next);
            roomRef.current?.send({ type: "state", payload: next });
          }
        } else if (msg.type === "restart") {
          const p = msg.payload as { totalWalls: number };
          const ns = initialState(p.totalWalls);
          setState(ns);
          if (isHost) roomRef.current?.send({ type: "state", payload: ns });
        }
      },
      onError: (err: Error) => {
        if (cancelled) return;
        console.error(err);
        const em = err?.message ?? String(err);
        if (em.includes("is taken") || em.includes("unavailable-id")) {
          setErrorMsg("That room code is already in use. Try again.");
        } else if (em.includes("peer-unavailable")) {
          setErrorMsg("No room found with that code.");
        } else {
          setErrorMsg(em);
        }
        setStatus("error");
      },
    };

    const boot = async () => {
      try {
        const room = isHost
          ? await createHostRoom(code, handlers)
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
  }, [code, isHost]);

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
        // guest: send to host, wait for state
        roomRef.current?.send({ type: "move", payload: move });
      }
    },
    [isHost, status],
  );

  const restart = useCallback(() => {
    const ns = initialState(state.totalWalls);
    if (isHost) {
      setState(ns);
      roomRef.current?.send({ type: "state", payload: ns });
    } else {
      roomRef.current?.send({ type: "restart", payload: { totalWalls: state.totalWalls } });
    }
  }, [isHost, state.totalWalls]);

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
  };

  const yourName = you === 0 ? "You (Indigo)" : "You (Rust)";
  const oppName = you === 0 ? "Opponent (Rust)" : "Opponent (Indigo)";

  const banner = useMemo(() => {
    if (status === "connecting") return "Establishing connection…";
    if (status === "waiting") return "Waiting for your opponent to join…";
    if (status === "disconnected") return "Opponent disconnected.";
    if (status === "error") return errorMsg ?? "Something went wrong.";
    if (state.winner !== null) {
      return state.winner === you ? "You won! 🎉" : "Your opponent won.";
    }
    return null;
  }, [status, errorMsg, state.winner, you]);

  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="order-2 lg:order-1">
        <QuoridorBoard
          state={state}
          you={you}
          onMove={handleMove}
          interactive={status === "connected" && state.winner === null}
        />
      </div>
      <aside className="order-1 flex flex-col gap-4 lg:order-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Room code</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-mono text-2xl tracking-[0.3em]">{code}</p>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isHost ? "Share this code with your friend." : "Connected to host."}
          </p>
        </div>

        {banner && (
          <div
            className="rounded-xl border p-4 text-sm"
            style={{
              borderColor:
                status === "error"
                  ? "var(--destructive)"
                  : "var(--border)",
              background: "var(--card)",
            }}
          >
            {banner}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Players</p>
          <PlayerRow
            name={yourName}
            color={you === 0 ? "var(--pawn-1)" : "var(--pawn-2)"}
            walls={state.wallsLeft[you]}
            active={state.turn === you && state.winner === null}
          />
          <PlayerRow
            name={oppName}
            color={you === 0 ? "var(--pawn-2)" : "var(--pawn-1)"}
            walls={state.wallsLeft[1 - you]}
            active={state.turn !== you && state.winner === null}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={restart}
            disabled={status !== "connected"}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary disabled:opacity-50"
          >
            New game
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium uppercase tracking-widest hover:bg-secondary"
          >
            Leave
          </button>
        </div>
      </aside>
    </div>
  );
}

function PlayerRow({
  name,
  color,
  walls,
  active,
}: {
  name: string;
  color: string;
  walls: number;
  active: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="block h-4 w-4 rounded-full"
          style={{
            background: color,
            boxShadow: active
              ? "0 0 0 3px oklch(0.55 0.12 40 / 0.35)"
              : "none",
          }}
        />
        <span className="text-sm">{name}</span>
      </div>
      <span className="text-xs text-muted-foreground">{walls} walls</span>
    </div>
  );
}
