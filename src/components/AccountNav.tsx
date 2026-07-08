import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRY_BY_ISO } from "@/lib/countries";

type Session = {
  signedIn: boolean;
  onboarded: boolean;
  username?: string;
  country?: string | null;
  email?: string | null;
};

export function AccountNav({ compact = false }: { compact?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user;
      const anon =
        !u ||
        u.is_anonymous === true ||
        (u.app_metadata?.provider ?? "") === "anonymous";
      if (!u || anon) {
        if (alive) setSession({ signedIn: false, onboarded: false });
        return;
      }
      const { data: p } = await supabase
        .from("players")
        .select("name,country,onboarded_at")
        .eq("auth_user_id", u.id)
        .not("onboarded_at", "is", null)
        .order("onboarded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      setSession({
        signedIn: true,
        onboarded: !!p?.onboarded_at,
        username: p?.name ?? u.email?.split("@")[0] ?? "player",
        country: p?.country ?? null,
        email: u.email,
      });
    };
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const pad = compact ? "px-3 py-1.5 text-[10px]" : "px-5 py-2.5 text-xs";

  if (session === null) {
    return <div className={"h-9 " + (compact ? "w-28" : "w-40") + " animate-pulse rounded-lg bg-zinc-900"} />;
  }
  if (session.signedIn && session.onboarded) {
    return <AccountMenu username={session.username!} country={session.country ?? null} compact={compact} />;
  }
  if (session.signedIn && !session.onboarded) {
    return (
      <Link
        to="/onboarding"
        className={`rounded-lg border border-amber-500/60 bg-amber-500/10 ${pad} font-semibold uppercase tracking-widest text-amber-200 hover:bg-amber-500/20`}
      >
        Finish signup →
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/auth"
        className={`rounded-lg border border-zinc-800 bg-zinc-900/60 ${pad} font-semibold uppercase tracking-widest text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white`}
      >
        Sign in
      </Link>
      {!compact && (
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="rounded-lg border border-emerald-500/60 bg-gradient-to-b from-emerald-500/20 to-emerald-600/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-emerald-100 shadow-lg shadow-emerald-900/30 transition-colors hover:border-emerald-400 hover:from-emerald-500/30 hover:to-emerald-600/20 hover:text-white"
        >
          Sign up
        </Link>
      )}
    </div>
  );
}

function AccountMenu({ username, country, compact }: { username: string; country: string | null; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const flag = country ? (COUNTRY_BY_ISO[country]?.flag ?? "🌐") : "🌐";
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-account-menu]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  async function signOut() {
    await supabase.auth.signOut();
    // Drop the local player identity so the next boot mints a fresh guest
    // name/id (rather than reusing the signed-out user's stored name).
    try {
      localStorage.removeItem("quoridor.playerId");
      localStorage.removeItem("quoridor.playerName");
    } catch { /* ignore */ }
    // Hard reload so every stale piece of app state resets and a new
    // anonymous session is minted on next boot.
    window.location.replace("/");
  }
  const btnPad = compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs";
  return (
    <div className="relative" data-account-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 ${btnPad} font-semibold text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800`}
      >
        <span className="text-base leading-none">{flag}</span>
        <span className="max-w-[120px] truncate">{username}</span>
        <svg className={"h-3 w-3 text-zinc-500 transition-transform " + (open ? "rotate-180" : "")} viewBox="0 0 12 12" fill="currentColor" aria-hidden><path d="M2 4l4 4 4-4z" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur"
          >
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Signed in as</p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                <span className="mr-1">{flag}</span>@{username}
              </p>
            </div>
            <ul className="py-1 text-sm">
              <MenuItem to="/friends" label="Friends" />
              <MenuItem to="/history" label="Match history" />
              <MenuItem to="/clips" label="Saved clips" />
              <MenuItem to="/stats" label="Leaderboard" />
              <li className="my-1 border-t border-zinc-800" />
              <li>
                <button onClick={signOut} className="flex w-full items-center px-4 py-2 text-left text-rose-400 hover:bg-zinc-900">
                  Sign out
                </button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center px-4 py-2 text-zinc-200 hover:bg-zinc-900 hover:text-white">
        {label}
      </Link>
    </li>
  );
}