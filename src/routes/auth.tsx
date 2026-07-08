import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { linkAuthToPlayer } from "@/lib/identity";
import { isOnboarded } from "@/lib/onboarding";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: s.mode === "signup" ? ("signup" as const) : ("signin" as const),
  }),
  head: () => ({
    meta: [
      { title: "Sign in · playquoridor.online" },
      {
        name: "description",
        content: "Sign in to playquoridor.online with Google or email to save your stats across devices.",
      },
      { property: "og:title", content: "Sign in · playquoridor.online" },
      { property: "og:description", content: "Sign in with Google or email to save your stats across devices." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<null | { email?: string | null; anon: boolean }>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data.user;
      if (!u) { setSignedIn(null); return; }
      const isAnon = (u.app_metadata?.provider ?? "") === "anonymous" || u.is_anonymous === true;
      setSignedIn({ email: u.email, anon: isAnon });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      if (!u) { setSignedIn(null); return; }
      const isAnon = (u.app_metadata?.provider ?? "") === "anonymous" || u.is_anonymous === true;
      setSignedIn({ email: u.email, anon: isAnon });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function onGoogle() {
    setError(null); setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      // Redirected flow will navigate away; direct flow lands here.
      if (!result.redirected) {
        await linkAuthToPlayer();
        const done = await isOnboarded();
        navigate({ to: done ? "/" : "/onboarding" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally { setBusy(false); }
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      await linkAuthToPlayer();
      const done = mode === "signup" ? false : await isOnboarded();
      navigate({ to: done ? "/" : "/onboarding" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally { setBusy(false); }
  }

  async function onSignOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("quoridor.playerId");
        localStorage.removeItem("quoridor.playerName");
      } catch { /* ignore */ }
      window.location.replace("/");
    } finally { setBusy(false); }
  }

  async function onForgotPassword() {
    setError(null); setResetMsg(null);
    const target = email.trim();
    if (!target) { setError("Enter your email above first, then click Forgot password."); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setResetMsg("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally { setBusy(false); }
  }

  const hasAccount = signedIn && !signedIn.anon;

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md">
        <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {hasAccount ? "Account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasAccount
            ? "You're signed in. Your stats and rooms are tied to this account."
            : "Optional. Sign in to keep your stats when you switch devices or clear browser data."}
        </p>

        {hasAccount ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <p className="text-sm">Signed in as <span className="font-medium">{signedIn?.email ?? "your account"}</span>.</p>
            <button onClick={onSignOut} disabled={busy}
              className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60">
              Sign out
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <button onClick={onGoogle} disabled={busy}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary/70 disabled:opacity-60">
              <GoogleGlyph /> Continue with Google
            </button>

            <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={onEmail} className="flex flex-col gap-3">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
              </label>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Password
                <div className="relative mt-1">
                  <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground outline-none focus:border-primary" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {resetMsg && <p className="text-xs text-emerald-500">{resetMsg}</p>}
              <button type="submit" disabled={busy}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70">
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>

            {mode === "signin" && (
              <button
                type="button"
                onClick={onForgotPassword}
                disabled={busy}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Forgot password?
              </button>
            )}

            <button
              type="button"
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setResetMsg(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}