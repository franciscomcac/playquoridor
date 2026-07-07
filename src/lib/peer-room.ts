// PeerJS wrapper. Host accepts up to (mode-1) guests, guests receive their
// assigned slot. Messages are JSON tagged by `type`.
import Peer, { type DataConnection } from "peerjs";

export type Mode = 2 | 4;

export type RosterEntry = { slot: number; name: string; playerId: string | null };

export type PeerMessage =
  | { type: "assign"; payload: { slot: number; mode: Mode; expected: number; name: string; roster: RosterEntry[] } }
  | { type: "presence"; payload: { count: number; expected: number; roster: RosterEntry[] } }
  | { type: "state"; payload: unknown }
  | { type: "move"; payload: unknown }
  | { type: "forfeit"; payload: unknown }
  | { type: "leave"; payload: { slot: number } }
  | { type: "nextRound"; payload: unknown }
  | { type: "newMatch"; payload: unknown }
  | { type: "coinflip"; payload: { starter: number } }
  | { type: "hello"; payload: { name: string; playerId: string | null } }
  | { type: "log"; payload: { text: string } }
  | { type: "afk"; payload: { slot: number; deadline: number } }
  | { type: "afkCancel"; payload: { slot: number } }
  | { type: "activity"; payload: { slot: number } };

const PREFIX = "quoridor-lvbl-";

export function makeRoomCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
export function peerIdFor(code: string): string { return PREFIX + code.toUpperCase(); }

export type RoomHandlers = {
  onOpen?: () => void;
  onPresence?: (count: number, expected: number, roster: RosterEntry[]) => void;
  onFull?: () => void;
  onAssign?: (slot: number, mode: Mode, expected: number, roster: RosterEntry[]) => void;
  onGuestJoined?: (slot: number, name: string) => void;
  onGuestLeft?: (slot: number, name: string) => void;
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
  getRoster: () => RosterEntry[];
};

export async function createHostRoom(
  code: string, mode: Mode, host: { name: string; playerId: string | null }, handlers: RoomHandlers,
): Promise<Room> {
  const id = peerIdFor(code);
  const peer = new Peer(id, { debug: 1 });
  const expected = mode;
  const conns: Array<{ conn: DataConnection; slot: number; name: string; playerId: string | null }> = [];
  const roster: RosterEntry[] = [{ slot: 0, name: host.name, playerId: host.playerId }];

  const uniqueName = (n: string): string => {
    const used = new Set(roster.map((r) => r.name.toLowerCase()));
    const base = n.trim().slice(0, 16) || "Guest";
    if (!used.has(base.toLowerCase())) return base;
    let k = 2;
    while (used.has(`${base.toLowerCase()} ${k}`)) k++;
    return `${base} ${k}`;
  };

  const openCount = () => 1 + conns.filter((c) => c.conn.open).length;

  peer.on("open", () => { handlers.onOpen?.(); handlers.onPresence?.(1, expected, roster.slice()); });
  peer.on("error", (err) => handlers.onError?.(err as Error));

  peer.on("connection", (c) => {
    if (conns.length >= mode - 1) {
      c.on("open", () => c.close());
      return;
    }
    const slot = conns.length + 1;
    const entry = { conn: c, slot, name: `Guest ${slot}`, playerId: null as string | null };
    conns.push(entry);
    // Placeholder roster entry until we get "hello"
    roster.push({ slot, name: entry.name, playerId: null });

    c.on("data", (data) => {
      const msg = data as PeerMessage;
      if (msg.type === "hello") {
        const p = msg.payload;
        const finalName = uniqueName(p.name);
        entry.name = finalName;
        entry.playerId = p.playerId;
        const idx = roster.findIndex((r) => r.slot === slot);
        if (idx >= 0) roster[idx] = { slot, name: finalName, playerId: p.playerId };
        c.send({ type: "assign", payload: { slot, mode, expected, name: finalName, roster: roster.slice() } });
        const count = openCount();
        const presence: PeerMessage = { type: "presence", payload: { count, expected, roster: roster.slice() } };
        handlers.onPresence?.(count, expected, roster.slice());
        for (const other of conns) if (other.conn.open) other.conn.send(presence);
        handlers.onGuestJoined?.(slot, finalName);
        if (count === expected) handlers.onFull?.();
      } else {
        handlers.onMessage?.(msg);
      }
    });
    c.on("close", () => {
      const idx = conns.indexOf(entry);
      if (idx >= 0) conns.splice(idx, 1);
      const rIdx = roster.findIndex((r) => r.slot === slot);
      const gone = rIdx >= 0 ? roster[rIdx].name : `Guest ${slot}`;
      if (rIdx >= 0) roster.splice(rIdx, 1);
      const count = openCount();
      const presence: PeerMessage = { type: "presence", payload: { count, expected, roster: roster.slice() } };
      handlers.onPresence?.(count, expected, roster.slice());
      for (const other of conns) if (other.conn.open) other.conn.send(presence);
      // Broadcast leave so host can handle it as an authoritative event.
      handlers.onGuestLeft?.(slot, gone);
      handlers.onMessage?.({ type: "leave", payload: { slot } });
    });
    c.on("error", (err) => handlers.onError?.(err as Error));
  });

  return {
    peer, isHost: true, code,
    send: (msg) => { for (const c of conns) if (c.conn.open) c.conn.send(msg); },
    close: () => { for (const c of conns) { try { c.conn.close(); } catch {} } peer.destroy(); },
    getRoster: () => roster.slice(),
  };
}

export async function createGuestRoom(
  code: string, guest: { name: string; playerId: string | null }, handlers: RoomHandlers,
): Promise<Room> {
  const peer = new Peer({ debug: 1 });
  let conn: DataConnection | null = null;
  let roster: RosterEntry[] = [];

  peer.on("error", (err) => handlers.onError?.(err as Error));
  peer.on("open", () => {
    handlers.onOpen?.();
    const c = peer.connect(peerIdFor(code), { reliable: true });
    conn = c;
    c.on("open", () => {
      c.send({ type: "hello", payload: { name: guest.name, playerId: guest.playerId } });
    });
    c.on("data", (data) => {
      const msg = data as PeerMessage;
      if (msg.type === "assign") {
        const p = msg.payload;
        roster = p.roster.slice();
        handlers.onAssign?.(p.slot, p.mode, p.expected, roster.slice());
      } else if (msg.type === "presence") {
        const p = msg.payload;
        roster = p.roster.slice();
        handlers.onPresence?.(p.count, p.expected, roster.slice());
        if (p.count === p.expected) handlers.onFull?.();
      }
      handlers.onMessage?.(msg);
    });
    c.on("close", () => { conn = null; handlers.onDisconnect?.(); });
    c.on("error", (err) => handlers.onError?.(err as Error));
  });

  return {
    peer, isHost: false, code,
    send: (msg) => { if (conn && conn.open) conn.send(msg); },
    close: () => { try { conn?.close(); } catch {} peer.destroy(); },
    getRoster: () => roster.slice(),
  };
}
