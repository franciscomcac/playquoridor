// Client-side player identity. Persists a stable UUID + display name in
// localStorage; ensures a row exists in the `players` table so stats key off it.
import { supabase } from "@/integrations/supabase/client";

const ID_KEY = "quoridor.playerId";
const NAME_KEY = "quoridor.playerName";

export type Identity = { id: string; name: string };

let authReady: Promise<string | null> | null = null;

// Ensure a Supabase auth session exists (anonymous by default). Idempotent —
// subsequent calls return the cached promise. Returns the auth.uid() or null
// if sign-in failed (network / provider off). All writes should await this
// before hitting the DB so RLS sees an authenticated user.
export function ensureAuthSession(): Promise<string | null> {
  if (authReady) return authReady;
  authReady = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session.user.id;
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) { console.warn("anon sign-in failed", error); return null; }
      return data.user?.id ?? null;
    } catch (e) {
      console.warn("ensureAuthSession failed", e);
      return null;
    }
  })();
  return authReady;
}

// Link the currently-authenticated user to the local player row. Safe to call
// on every SIGNED_IN event; RLS allows the first claim and no-op thereafter.
export async function linkAuthToPlayer(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    const ident = getStoredIdentity();
    if (!uid) return;
    if (!ident) {
      // No local identity yet — hydrate it from the account's existing
      // players row instead of leaving the user with no name link.
      await restoreIdentityFromAuth();
      return;
    }
    await supabase.from("players").upsert({
      id: ident.id, name: ident.name, auth_user_id: uid,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("linkAuthToPlayer failed", e);
  }
}

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
  void (async () => {
    const uid = await ensureAuthSession();
    const { error } = await supabase.from("players").upsert({
      id, name: clean, auth_user_id: uid,
      updated_at: new Date().toISOString(),
    });
    if (error) console.warn("player upsert failed", error);
  })();
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

// Try to hydrate a stored identity from the signed-in user's `players` row.
// Runs when localStorage has no identity but the user IS signed in (new
// browser, cleared storage, incognito) — without this we'd mint a random
// gamer name and orphan the account for the session.
export async function restoreIdentityFromAuth(): Promise<Identity | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    // Skip anonymous auth sessions — those aren't a "real" account.
    if (session?.user?.is_anonymous) return null;
    const { data, error } = await supabase
      .from("players")
      .select("id,name")
      .eq("auth_user_id", uid)
      .maybeSingle();
    if (error || !data) return null;
    localStorage.setItem(ID_KEY, data.id);
    localStorage.setItem(NAME_KEY, data.name);
    return { id: data.id, name: data.name };
  } catch (e) {
    console.warn("restoreIdentityFromAuth failed", e);
    return null;
  }
}
