import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getStoredIdentity, setStoredIdentity, ensureAuthSession } from "@/lib/identity";
import { COUNTRIES, COUNTRY_BY_ISO, type Country } from "@/lib/countries";
import { WORLD_VIEWBOX, WORLD_SILHOUETTE, COUNTRY_PATHS, projectLatLng } from "@/lib/world-map";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your profile · playquoridor.online" },
      { name: "description", content: "Pick your permanent username and country to complete your Quoridor profile." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

const NAME_RE = /^[a-zA-Z0-9_]+$/;

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [country, setCountry] = useState<Country | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<null | boolean>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const isAnon = !u || u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
      if (isAnon) {
        void navigate({ to: "/auth", search: { mode: "signup" } });
        return;
      }
      setAuthed(true);
    });
  }, [navigate]);

  // Live username availability
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) { setNameStatus("idle"); return; }
    if (trimmed.length < 3 || trimmed.length > 16 || !NAME_RE.test(trimmed)) {
      setNameStatus("invalid"); return;
    }
    setNameStatus("checking");
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("check_username_available", { _name: trimmed });
      if (error) { setNameStatus("idle"); return; }
      setNameStatus(data ? "ok" : "taken");
    }, 300);
    return () => window.clearTimeout(t);
  }, [name]);

  const canContinueName = nameStatus === "ok";

  async function finish() {
    if (!country || !canContinueName) return;
    setBusy(true); setError(null);
    try {
      await ensureAuthSession();
      let ident = getStoredIdentity();
      if (!ident) ident = setStoredIdentity(name.trim());
      const { error } = await supabase.rpc("complete_onboarding", {
        _player_id: ident.id,
        _name: name.trim(),
        _country: country.iso,
      });
      if (error) throw error;
      // Refresh stored identity name
      setStoredIdentity(name.trim());
      try { localStorage.setItem("quoridor.country", country.iso); } catch {}
      void navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  if (authed === null) {
    return <main className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:py-14">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Playquoridor · Setup</p>
          <div className="flex gap-2">
            {[0, 1].map((i) => (
              <span key={i} className={"h-1.5 w-10 rounded-full transition-colors " + (i <= step ? "bg-emerald-400" : "bg-zinc-800")} />
            ))}
          </div>
        </div>

        <div className="mt-10 flex-1">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="username"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="mx-auto max-w-lg"
              >
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pick your username.</h1>
                <p className="mt-3 text-sm text-zinc-400">This is your permanent handle. 3–16 characters, letters, numbers, underscores.</p>
                <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-2xl">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Username</label>
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                    <span className="text-zinc-500">@</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.replace(/\s+/g, ""))}
                      maxLength={16}
                      autoFocus
                      placeholder="wall_wizard"
                      className="flex-1 bg-transparent text-lg outline-none placeholder:text-zinc-700"
                    />
                    <StatusDot status={nameStatus} />
                  </div>
                  <p className="mt-2 text-xs">
                    {nameStatus === "invalid" && <span className="text-rose-400">Only letters, numbers, and underscores (3–16).</span>}
                    {nameStatus === "taken" && <span className="text-rose-400">Someone already took that one.</span>}
                    {nameStatus === "ok" && <span className="text-emerald-400">Available — nice pick.</span>}
                    {nameStatus === "checking" && <span className="text-zinc-500">Checking…</span>}
                    {nameStatus === "idle" && <span className="text-zinc-600">{name.length}/16</span>}
                  </p>
                </div>
                <div className="mt-6 flex justify-end">
                  <motion.button
                    disabled={!canContinueName}
                    onClick={() => setStep(1)}
                    whileTap={{ scale: 0.97 }}
                    className="rounded-xl bg-emerald-500 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-emerald-950 shadow-[0_20px_50px_-20px_rgba(16,185,129,0.7)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue →
                  </motion.button>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="country"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
              >
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Where are you?</h1>
                  <p className="mt-3 text-sm text-zinc-400">Type a country. Watch it light up on the map.</p>
                  <CountryPicker value={country} onChange={setCountry} />
                  {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
                  <div className="mt-6 flex justify-between gap-3">
                    <button
                      onClick={() => setStep(0)}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800"
                    >
                      ← Back
                    </button>
                    <motion.button
                      disabled={!country || busy}
                      onClick={finish}
                      whileTap={{ scale: 0.97 }}
                      className="flex-1 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-emerald-950 shadow-[0_20px_50px_-20px_rgba(16,185,129,0.7)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? "Saving…" : "Finish"}
                    </motion.button>
                  </div>
                </div>
                <WorldMap country={country} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

function StatusDot({ status }: { status: "idle" | "checking" | "ok" | "taken" | "invalid" }) {
  const color =
    status === "ok" ? "bg-emerald-400" :
    status === "taken" || status === "invalid" ? "bg-rose-400" :
    status === "checking" ? "bg-amber-400" : "bg-zinc-700";
  return (
    <motion.span
      key={status}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={"h-2.5 w-2.5 rounded-full " + color + (status === "checking" ? " animate-pulse" : "")}
    />
  );
}

function CountryPicker({ value, onChange }: { value: Country | null; onChange: (c: Country) => void }) {
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return COUNTRIES.slice(0, 8);
    const starts: Country[] = [];
    const contains: Country[] = [];
    for (const c of COUNTRIES) {
      const n = c.name.toLowerCase();
      if (n.startsWith(s)) starts.push(c);
      else if (n.includes(s)) contains.push(c);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [q]);

  useEffect(() => { setHighlight(0); }, [q]);

  const pick = (c: Country) => { onChange(c); setQ(c.name); };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <span className="text-lg">{value?.flag ?? "🌍"}</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (results[highlight]) pick(results[highlight]); }
          }}
          placeholder="Type a country…"
          className="flex-1 bg-transparent outline-none placeholder:text-zinc-700"
        />
      </div>
      {q && results.length > 0 && !(value && value.name === q) && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          {results.map((c, i) => (
            <li key={c.iso}>
              <button
                onClick={() => pick(c)}
                onMouseEnter={() => setHighlight(i)}
                className={"flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors " +
                  (i === highlight ? "bg-emerald-500/15 text-white" : "text-zinc-300 hover:bg-zinc-900")}
              >
                <span className="text-lg">{c.flag}</span>
                <span>{c.name}</span>
                <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-500">{c.iso}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorldMap({ country }: { country: Country | null }) {
  const pin = country ? projectLatLng(country.lat, country.lng) : null;
  const hlPath = country ? COUNTRY_PATHS[country.iso] : null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4 shadow-2xl">
      <svg viewBox={WORLD_VIEWBOX} className="h-auto w-full">
        {/* Ocean glow */}
        <defs>
          <radialGradient id="ocean" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="rgb(30 30 40)" />
            <stop offset="100%" stopColor="rgb(9 9 12)" />
          </radialGradient>
          <filter id="pinGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <rect width="1000" height="500" fill="url(#ocean)" />
        {/* Latitude grid */}
        {[100, 200, 300, 400].map((y) => (
          <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke="rgb(39 39 42)" strokeWidth="0.5" />
        ))}
        {/* Silhouette */}
        <path d={WORLD_SILHOUETTE} fill="rgb(63 63 70)" stroke="rgb(24 24 27)" strokeWidth="0.4" />
        {/* Highlighted country */}
        <AnimatePresence>
          {hlPath && (
            <motion.path
              key={country?.iso}
              d={hlPath}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              fill="rgb(16 185 129)"
              stroke="rgb(6 78 59)"
              strokeWidth="0.6"
            />
          )}
        </AnimatePresence>
        {/* Pin */}
        {pin && (
          <>
            <motion.circle
              key={"glow-" + country?.iso}
              cx={pin.x} cy={pin.y}
              r={18}
              fill="rgb(52 211 153)"
              opacity={0.35}
              filter="url(#pinGlow)"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.6, 1] }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            <motion.circle
              key={"pin-" + country?.iso}
              cx={pin.x} cy={pin.y}
              r={5}
              fill="rgb(255 255 255)"
              stroke="rgb(16 185 129)"
              strokeWidth={2}
              initial={{ scale: 0, y: pin.y - 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-3">
        <span className="text-3xl">{country?.flag ?? "🌐"}</span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Selected</p>
          <p className="text-lg font-semibold text-white">{country?.name ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}