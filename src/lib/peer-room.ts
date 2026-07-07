// PeerJS wrapper — host accepts up to (mode-1) guests, guests receive their
// assigned slot. Messages are JSON tagged by `type`.
import Peer, { type DataConnection } from "peerjs";

export type Mode = 2 | 4;

export type PeerMessage =
  | { type: "assign"; payload: { slot: number; mode: Mode; expected: number } }
  | { type: "presence"; payload: { count: number; expected: number } }
  | { type: "state"; payload: unknown }
  | { type: "move"; payload: unknown }
  | { type: "forfeit"; payload: unknown }
  | { type: "nextRound"; payload: unknown }
  | { type: "newMatch"; payload: unknown }
  | { type: "coinflip"; payload: { starter: number } };

const PREFIX = "quoridor-lvbl-";

export function makeRoomCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function peerIdFor(code: string): string {
  return PREFIX + code.toUpperCase();
}

export type RoomHandlers = {
  onOpen?: () => void;
  onPresence?: (count: number, expected: number) => void;
  onFull?: () => void;
  onAssign?: (slot: number, mode: Mode, expected: number) => void;
  onDisconnect?: () => void;
  onMessage?: (msg: PeerMessage) => void;
  onError?: (err: Error) => void;
};

export type Room = {
  peer: Peer;
  send: (msg: PeerMessage) => void;
  close: () => void;
  isHost: boolean;
  code: string;
};

export async function createHostRoom(
  code: string,
  mode: Mode,
  handlers: RoomHandlers,
): Promise<Room> {
  const id = peerIdFor(code);
  const peer = new Peer(id, { debug: 1 });
  const expected = mode; // host + (mode-1) guests
  const conns: DataConnection[] = [];

  const openCount = () => 1 + conns.filter((c) => c.open).length;

  peer.on("open", () => {
    handlers.onOpen?.();
    handlers.onPresence?.(1, expected);
  });
  peer.on("error", (err) => handlers.onError?.(err as Error));
  peer.on("connection", (c) => {
    if (conns.length >= mode - 1) {
      c.on("open", () => c.close());
      return;
    }
    const slot = conns.length + 1;
    conns.push(c);
    c.on("open", () => {
      c.send({ type: "assign", payload: { slot, mode, expected } });
      const count = openCount();
      const presence: PeerMessage = { type: "presence", payload: { count, expected } };
      handlers.onPresence?.(count, expected);
      for (const other of conns) if (other.open) other.send(presence);
      if (count === expected) handlers.onFull?.();
    });
    c.on("data", (data) => handlers.onMessage?.(data as PeerMessage));
    c.on("close", () => {
      const idx = conns.indexOf(c);
      if (idx >= 0) conns.splice(idx, 1);
      const count = openCount();
      const presence: PeerMessage = { type: "presence", payload: { count, expected } };
      handlers.onPresence?.(count, expected);
      for (const other of conns) if (other.open) other.send(presence);
      handlers.onDisconnect?.();
    });
    c.on("error", (err) => handlers.onError?.(err as Error));
  });

  return {
    peer,
    isHost: true,
    code,
    send: (msg) => {
      for (const c of conns) if (c.open) c.send(msg);
    },
    close: () => {
      for (const c of conns) {
        try {
          c.close();
        } catch {}
      }
      peer.destroy();
    },
  };
}

export async function createGuestRoom(
  code: string,
  handlers: RoomHandlers,
): Promise<Room> {
  const peer = new Peer({ debug: 1 });
  let conn: DataConnection | null = null;

  peer.on("error", (err) => handlers.onError?.(err as Error));
  peer.on("open", () => {
    handlers.onOpen?.();
    const c = peer.connect(peerIdFor(code), { reliable: true });
    conn = c;
    c.on("data", (data) => {
      const msg = data as PeerMessage;
      if (msg.type === "assign") {
        const p = msg.payload;
        handlers.onAssign?.(p.slot, p.mode, p.expected);
      } else if (msg.type === "presence") {
        const p = msg.payload;
        handlers.onPresence?.(p.count, p.expected);
        if (p.count === p.expected) handlers.onFull?.();
      }
      handlers.onMessage?.(msg);
    });
    c.on("close", () => {
      conn = null;
      handlers.onDisconnect?.();
    });
    c.on("error", (err) => handlers.onError?.(err as Error));
  });

  return {
    peer,
    isHost: false,
    code,
    send: (msg) => {
      if (conn && conn.open) conn.send(msg);
    },
    close: () => {
      try {
        conn?.close();
      } catch {}
      peer.destroy();
    },
  };
}