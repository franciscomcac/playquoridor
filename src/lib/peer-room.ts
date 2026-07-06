// PeerJS wrapper — host creates a peer with a short ID; guest connects to it.
// Messages are JSON with a `type` discriminator.
import Peer, { type DataConnection } from "peerjs";

export type PeerMessage =
  | { type: "state"; payload: unknown }
  | { type: "move"; payload: unknown }
  | { type: "restart"; payload: { totalWalls: number } }
  | { type: "chat"; payload: string };

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
  onConnect?: (conn: DataConnection) => void;
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

export async function createHostRoom(code: string, handlers: RoomHandlers): Promise<Room> {
  const id = peerIdFor(code);
  const peer = new Peer(id, { debug: 1 });
  let conn: DataConnection | null = null;

  peer.on("open", () => handlers.onOpen?.());
  peer.on("error", (err) => handlers.onError?.(err as Error));
  peer.on("connection", (c) => {
    if (conn && conn.open) {
      // reject additional connections
      c.on("open", () => c.close());
      return;
    }
    conn = c;
    c.on("open", () => handlers.onConnect?.(c));
    c.on("data", (data) => handlers.onMessage?.(data as PeerMessage));
    c.on("close", () => {
      conn = null;
      handlers.onDisconnect?.();
    });
    c.on("error", (err) => handlers.onError?.(err as Error));
  });

  return {
    peer,
    isHost: true,
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

export async function createGuestRoom(code: string, handlers: RoomHandlers): Promise<Room> {
  const peer = new Peer({ debug: 1 });
  let conn: DataConnection | null = null;

  peer.on("error", (err) => handlers.onError?.(err as Error));

  peer.on("open", () => {
    handlers.onOpen?.();
    conn = peer.connect(peerIdFor(code), { reliable: true });
    conn.on("open", () => handlers.onConnect?.(conn!));
    conn.on("data", (data) => handlers.onMessage?.(data as PeerMessage));
    conn.on("close", () => {
      conn = null;
      handlers.onDisconnect?.();
    });
    conn.on("error", (err) => handlers.onError?.(err as Error));
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