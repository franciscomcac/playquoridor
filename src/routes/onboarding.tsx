import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureAuthSession,
  getStoredIdentity,
  isValidName,
  sanitizeName,
  setStoredIdentity,
} from "@/lib/identity";
import { COUNTRIES } from "@/lib/countries";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome · playquoridor.online" },
      { name: "description", content: "Pick a username and country to finish setting up your Quoridor account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

type NameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

function OnboardingPage() {
  const navigate = useNavigate();
  const initial = getStoredIdentity();
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState<NameStatus>("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [country, setCountry] = useState<string>("");
  const [countryQuery, setCountryQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkSeq = useRef(0);

  // Redirect anon-only users away; they don't need onboarding.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data.user;
      const isAnon = !u || (u.app_metadata?.provider ?? "") === "anonymous" || u.is_anonymous === true;
      if (isAnon) navigate({ to: "/auth" });
    });
    return () => { alive = false; };
  }, [navigate]);

  // Live availability check (debounced).
  useEffect(() => {
    const clean = sanitizeName(name);
    if (!isValidName(clean)) { setStatus(clean.length === 0 ? "idle" : "invalid"); setSuggestions([]); return; }
    if (initial && clean.toLowerCase() === initial.name.toLowerCase()) {
      setStatus("available"); setSuggestions([]); return;
    }
    setStatus("checking");
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("players")
        .select("name")
        .ilike("name", clean)
        .limit(1);
      if (seq !== checkSeq.current) return;
      if (data && data.length > 0) {
        setStatus("taken");
        setSuggestions([`${clean}${randDigits(2)}`, `${clean}_${randDigits(3)}`, `${clean}.${adjective()}`]);
      } else {
        setStatus("available");
        setSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [name, initial]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES.slice(0, 12);
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q).slice(0, 12);
  }, [countryQuery]);

  const canSubmit = status === "available" && country !== "" && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const clean = sanitizeName(name);
      const ident = setStoredIdentity(clean);
      const uid = await ensureAuthSession();
      const { error: err } = await supabase.from("players").upsert({
        id: ident.id,
        name: ident.name,
        auth_user_id: uid,
        country,
        onboarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (err) throw err;
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = COUNTRIES.find((c) => c.code === country);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-lg">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Step 1 of 1 · Required</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome — let's set you up</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a username other players will see, and the flag you want to represent.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
          <section>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Username</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                autoFocus
                placeholder="e.g. wallmaster"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-24 text-sm text-foreground outline-none focus:border-primary"
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <StatusBadge status={status} />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">2–16 characters. Visible on leaderboards and shared result cards.</p>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setName(s)}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-secondary/70"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Country</label>
            <input
              type="text"
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder={chosen ? `Selected: ${chosen.flag} ${chosen.name}` : "Search country…"}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {filteredCountries.map((c) => {
                const active = c.code === country;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { setCountry(c.code); setCountryQuery(""); }}
                    className={
                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition " +
                      (active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-secondary/70")
                    }
                  >
                    <span className="text-lg leading-none">{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
              {filteredCountries.length === 0 && (
                <p className="col-span-full text-xs text-muted-foreground">No matches. Try another name.</p>
              )}
            </div>
          </section>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? "Saving…" : "Finish setup"}
          </button>
        </form>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: NameStatus }) {
  const map: Record<NameStatus, { text: string; cls: string }> = {
    idle: { text: "", cls: "" },
    checking: { text: "Checking…", cls: "text-muted-foreground" },
    available: { text: "✓ Available", cls: "text-emerald-500" },
    taken: { text: "✗ Taken", cls: "text-destructive" },
    invalid: { text: "Too short", cls: "text-destructive" },
  };
  const s = map[status];
  if (!s.text) return null;
  return <span className={"text-xs font-medium " + s.cls}>{s.text}</span>;
}

function randDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}
function adjective(): string {
  const a = ["swift", "sly", "bold", "quiet", "sharp", "wise", "brave", "lucky"];
  return a[Math.floor(Math.random() * a.length)];
}