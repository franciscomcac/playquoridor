// Client-side player identity. Persists a stable UUID + display name in
// localStorage; ensures a row exists in the `players` table so stats key off it.
import { supabase } from "@/integrations/supabase/client";

const ID_KEY = "quoridor.playerId";
const NAME_KEY = "quoridor.playerName";

export type Identity = { id: string; name: string };

function randomUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 16);
}
export function isValidName(raw: string): boolean {
  const s = sanitizeName(raw);
  return s.length >= 2 && s.length <= 16;
}
export function getStoredIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(ID_KEY);
  const name = localStorage.getItem(NAME_KEY);
  if (!id || !name) return null;
  return { id, name };
}
export function setStoredIdentity(name: string): Identity {
  const clean = sanitizeName(name);
  let id = localStorage.getItem(ID_KEY);
  if (!id) { id = randomUuid(); localStorage.setItem(ID_KEY, id); }
  localStorage.setItem(NAME_KEY, clean);
  const ident = { id, name: clean };
  void supabase.from("players")
    .upsert({ id, name: clean, updated_at: new Date().toISOString() })
    .then(({ error }) => { if (error) console.warn("player upsert failed", error); });
  return ident;
}
export function ensureUniqueName(taken: string[], candidate: string): string {
  const clean = sanitizeName(candidate) || "Player";
  const lower = clean.toLowerCase();
  const used = new Set(taken.map((t) => t.toLowerCase()));
  if (!used.has(lower)) return clean;
  let n = 2;
  while (used.has(`${lower} ${n}`)) n++;
  return `${clean} ${n}`;
}
