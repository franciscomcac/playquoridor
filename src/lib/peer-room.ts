// PeerJS wrapper. Host accepts up to (mode-1) guests, guests receive their
// assigned slot. Messages are JSON tagged by `type`.
import Peer, { type DataConnection } from "peerjs";

export type Mode = 2 | 4;

export type RosterEntry = { slot: number; name: string; playerId: string | null };

export type PeerMessage =
  | { type: "assign"; payload: { slot: number; mode: Mode; expected: number; name: string; roster: RosterEntry[] } }
  | { type: "spectateAssign"; payload: { mode: Mode; expected: number; roster: RosterEntry[] } }
  | { type: "presence"; payload: { count: number; expected: number; roster: RosterEntry[] } }
  | { type: "state"; payload: unknown }
  | { type: "move"; payload: unknown }
  | { type: "forfeit"; payload: unknown }
  | { type: "leave"; payload: { slot: number } }
  | { type: "nextRound"; payload: unknown }
  | { type: "newMatch"; payload: unknown }
  | { type: "coinflip"; payload: { starter: number } }
  | { type: "hello"; payload: { name: string; playerId: string | null; spectator?: boolean } }
  | { type: "log"; payload: { text: string } }
  | { type: "afk"; payload: { slot: number; deadline: number } }
  | { type: "afkCancel"; payload: { slot: number } }
  | { type: "activity"; payload: { slot: number } }
  | { type: "ready"; payload: { slot: number } }
  | { type: "readyState"; payload: { slots: number[] } }
  | { type: "chat"; payload: { slot: number; name: string; text: string; ts: number } };

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
  onSpectateAssign?: (mode: Mode, expected: number, roster: RosterEntry[]) => void;
  onGuestJoined?: (slot: number, name: string) => void;
  onGuestLeft?: (slot: number, name: string) => void;
  onSpectatorJoined?: (name: string) => void;
  onSpectatorLeft?: (name: string) => void;
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
  /**
   * Host-only: fill unclaimed player slots with virtual "bot" entries so a
   * partially-filled 4p lobby can start with bots controlling the empty
   * seats. Returns the slot numbers that were assigned to bots.
   */
  addBotPlayers?: (bots: Array<{ name: string }>) => number[];
};

export async function createHostRoom(
  code: string, mode: Mode, host: { name: string; playerId: string | null }, handlers: RoomHandlers,
): Promise<Room> {
  const id = peerIdFor(code);
  const peer = new Peer(id, { debug: 1 });
  const expected = mode;
  const conns: Array<{ conn: DataConnection; slot: number; name: string; playerId: string | null }> = [];
  const roster: RosterEntry[] = [{ slot: 0, name: host.name, playerId: host.playerId }];
  const spectators: Array<{ conn: DataConnection; name: string }> = [];
  const virtualBots: RosterEntry[] = [];
  // Last-known broadcast per replayable type — used to catch spectators up on join.
  let lastState: unknown = null;
  let lastCoinflip: { starter: number } | null = null;
  let lastAfk: { slot: number; deadline: number } | null = null;

  const uniqueName = (n: string): string => {
    const used = new Set(roster.map((r) => r.name.toLowerCase()));
    const base = n.trim().slice(0, 16) || "Guest";
    if (!used.has(base.toLowerCase())) return base;
    let k = 2;
    while (used.has(`${base.toLowerCase()} ${k}`)) k++;
    return `${base} ${k}`;
  };

  const openCount = () => 1 + conns.filter((c) => c.conn.open).length + virtualBots.length;

  const broadcastToSpectators = (msg: PeerMessage) => {
    for (const s of spectators) if (s.conn.open) s.conn.send(msg);
  };

  peer.on("open", () => { handlers.onOpen?.(); handlers.onPresence?.(1, expected, roster.slice()); });
  peer.on("error", (err) => handlers.onError?.(err as Error));

  peer.on("connection", (c) => {
    // We don't know yet whether this connection is a player or a spectator —
    // wait for the first `hello` before deciding.
    let role: "player" | "spectator" | null = null;
    let playerEntry: { conn: DataConnection; slot: number; name: string; playerId: string | null } | null = null;
    let spectatorEntry: { conn: DataConnection; name: string } | null = null;

    c.on("data", (data) => {
      const msg = data as PeerMessage;
      if (msg.type === "hello" && role === null) {
        const p = msg.payload;
        if (p.spectator) {
          role = "spectator";
          const specName = (p.name || "Spectator").slice(0, 16);
          spectatorEntry = { conn: c, name: specName };
          spectators.push(spectatorEntry);
          c.send({
            type: "spectateAssign",
            payload: { mode, expected, roster: roster.slice() },
          });
          // Catch the spectator up on the current match.
          if (lastState !== null) c.send({ type: "state", payload: lastState });
          if (lastCoinflip) c.send({ type: "coinflip", payload: lastCoinflip });
          if (lastAfk) c.send({ type: "afk", payload: lastAfk });
          handlers.onSpectatorJoined?.(specName);
          return;
        }
        role = "player";
        const existing = p.playerId
          ? roster.find((r) => r.playerId === p.playerId && r.slot > 0)
          : null;
        if (existing && conns.some((entry) => entry.slot === existing.slot && entry.conn.open)) {
          try { c.close(); } catch { /* noop */ }
          return;
        }
        const reservedSlots = new Set(roster.map((r) => r.slot));
        const openSlot = Array.from({ length: mode - 1 }, (_, i) => i + 1)
          .find((candidate) => !reservedSlots.has(candidate));
        if (!existing && openSlot === undefined) {
          try { c.close(); } catch { /* noop */ }
          return;
        }
        const slot = existing?.slot ?? openSlot!;
        const finalName = existing?.name ?? uniqueName(p.name);
        playerEntry = { conn: c, slot, name: finalName, playerId: p.playerId };
        conns.push(playerEntry);
        if (!existing) roster.push({ slot, name: finalName, playerId: p.playerId });
        c.send({ type: "assign", payload: { slot, mode, expected, name: finalName, roster: roster.slice() } });
        if (lastState !== null) c.send({ type: "state", payload: lastState });
        if (lastCoinflip) c.send({ type: "coinflip", payload: lastCoinflip });
        if (lastAfk) c.send({ type: "afk", payload: lastAfk });
        const count = openCount();
        const presence: PeerMessage = { type: "presence", payload: { count, expected, roster: roster.slice() } };
        handlers.onPresence?.(count, expected, roster.slice());
        // Send to ALL connections including the newcomer — otherwise the
        // guest never sees count===expected and onFull never fires on their
        // side, leaving the board stuck in "waiting" and non-interactive.
        for (const other of conns) if (other.conn.open) other.conn.send(presence);
        broadcastToSpectators(presence);
        handlers.onGuestJoined?.(slot, finalName);
        if (count === expected) handlers.onFull?.();
        return;
      }
      if (role === "spectator") {
        // Spectators are read-only — ignore every message they might send.
        return;
      }
      handlers.onMessage?.(msg);
    });

    c.on("close", () => {
      if (role === "spectator" && spectatorEntry) {
        const i = spectators.indexOf(spectatorEntry);
        if (i >= 0) spectators.splice(i, 1);
        handlers.onSpectatorLeft?.(spectatorEntry.name);
        return;
      }
      if (role !== "player" || !playerEntry) return;
      const entry = playerEntry;
      const i = conns.indexOf(entry);
      if (i >= 0) conns.splice(i, 1);
      const rIdx = roster.findIndex((r) => r.slot === entry.slot);
      const gone = rIdx >= 0 ? roster[rIdx].name : `Guest ${entry.slot}`;
      if (lastState === null && rIdx >= 0) roster.splice(rIdx, 1);
      const count = openCount();
      const presence: PeerMessage = { type: "presence", payload: { count, expected, roster: roster.slice() } };
      handlers.onPresence?.(count, expected, roster.slice());
      for (const other of conns) if (other.conn.open) other.conn.send(presence);
      broadcastToSpectators(presence);
      handlers.onGuestLeft?.(entry.slot, gone);
    });
    c.on("error", (err) => handlers.onError?.(err as Error));
  });

  return {
    peer, isHost: true, code,
    send: (msg) => {
      // Remember replayable state so late-joining spectators can catch up.
      if (msg.type === "state") lastState = msg.payload;
      else if (msg.type === "coinflip") lastCoinflip = msg.payload as { starter: number };
      else if (msg.type === "afk") lastAfk = msg.payload as { slot: number; deadline: number };
      else if (msg.type === "afkCancel") lastAfk = null;
      for (const c of conns) if (c.conn.open) c.conn.send(msg);
      broadcastToSpectators(msg);
    },
    close: () => {
      for (const c of conns) { try { c.conn.close(); } catch { /* noop */ } }
      for (const s of spectators) { try { s.conn.close(); } catch { /* noop */ } }
      peer.destroy();
    },
    getRoster: () => roster.slice(),
    addBotPlayers: (bots) => {
      const reservedSlots = new Set(roster.map((r) => r.slot));
      const assigned: number[] = [];
      for (const b of bots) {
        const openSlot = Array.from({ length: mode - 1 }, (_, i) => i + 1)
          .find((c) => !reservedSlots.has(c));
        if (openSlot === undefined) break;
        reservedSlots.add(openSlot);
        const entry: RosterEntry = { slot: openSlot, name: uniqueName(b.name), playerId: null };
        roster.push(entry);
        virtualBots.push(entry);
        assigned.push(openSlot);
      }
      if (assigned.length === 0) return assigned;
      const count = openCount();
      const presence: PeerMessage = { type: "presence", payload: { count, expected, roster: roster.slice() } };
      handlers.onPresence?.(count, expected, roster.slice());
      for (const other of conns) if (other.conn.open) other.conn.send(presence);
      broadcastToSpectators(presence);
      if (count === expected) handlers.onFull?.();
      return assigned;
    },
  };
}

export async function createGuestRoom(
  code: string,
  guest: { name: string; playerId: string | null },
  handlers: RoomHandlers,
  opts: { spectator?: boolean } = {},
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
      c.send({
        type: "hello",
        payload: {
          name: guest.name,
          playerId: guest.playerId,
          ...(opts.spectator ? { spectator: true } : {}),
        },
      });
    });
    c.on("data", (data) => {
      const msg = data as PeerMessage;
      if (msg.type === "assign") {
        const p = msg.payload;
        roster = p.roster.slice();
        handlers.onAssign?.(p.slot, p.mode, p.expected, roster.slice());
      } else if (msg.type === "spectateAssign") {
        const p = msg.payload;
        roster = p.roster.slice();
        handlers.onSpectateAssign?.(p.mode, p.expected, roster.slice());
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

export async function createSpectatorRoom(
  code: string,
  spectator: { name: string; playerId: string | null },
  handlers: RoomHandlers,
): Promise<Room> {
  return createGuestRoom(code, spectator, handlers, { spectator: true });
}
