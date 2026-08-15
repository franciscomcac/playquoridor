import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { linkAuthToPlayer } from "@/lib/identity";
import { isOnboarded } from "@/lib/onboarding";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signin" | "signup" } => ({
    mode: s.mode === "signup" ? "signup" : "signin",
  }),
  head: () => ({
    meta: [
      { title: "Sign in · playquoridor.online" },
      {
        name: "description",
        content:
          "Sign in to playquoridor.online with Google or email to save your stats across devices.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
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
      if (!u) {
        setSignedIn(null);
        return;
      }
      const isAnon = (u.app_metadata?.provider ?? "") === "anonymous" || u.is_anonymous === true;
      setSignedIn({ email: u.email, anon: isAnon });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      if (!u) {
        setSignedIn(null);
        return;
      }
      const isAnon = (u.app_metadata?.provider ?? "") === "anonymous" || u.is_anonymous === true;
      setSignedIn({ email: u.email, anon: isAnon });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setBusy(false);
    }
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
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
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("quoridor.playerId");
        localStorage.removeItem("quoridor.playerName");
      } catch {
        /* ignore */
      }
      window.location.replace("/");
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setError(null);
    setResetMsg(null);
    const target = email.trim();
    if (!target) {
      setError("Enter your email above first, then click Forgot password.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setResetMsg("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  const hasAccount = signedIn && !signedIn.anon;

  return (
    <main className="relative min-h-screen bg-[#0d0d10] text-foreground flex items-center justify-center py-10 px-4 sm:px-8">
      {/* Background from Lobby */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(#191920 1px,transparent 1px),linear-gradient(90deg,#191920 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          WebkitMaskImage: "radial-gradient(ellipse 52% 68% at 50% 32%,#000 15%,transparent 72%)",
          maskImage: "radial-gradient(ellipse 52% 68% at 50% 32%,#000 15%,transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[16%] h-[340px] w-full max-w-[620px] -translate-x-1/2"
        style={{
          background: "radial-gradient(closest-side,rgba(245,165,36,0.14),transparent 68%)",
          opacity: 0.6,
        }}
      />

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="rounded-2xl border border-[#232329] bg-[#111114] p-6 sm:p-8 shadow-2xl">
          <Link
            to="/"
            className="inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66] hover:text-[#ececf1] transition-colors mb-6"
          >
            ← Back to Home
          </Link>

          <h1 className="text-[28px] font-bold tracking-tight text-[#ececf1] mb-2">
            {hasAccount ? "Account" : mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-[13px] text-[#83838e] mb-8">
            {hasAccount
              ? "You're signed in. Your stats and rooms are tied to this account."
              : "Access your stats, ranked matches, and saved games anywhere."}
          </p>

          {hasAccount ? (
            <div className="rounded-[10px] border border-[#232329] bg-[#0d0d10] p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 rounded-full bg-[rgba(245,165,36,0.14)] border border-[rgba(245,165,36,0.35)] flex items-center justify-center text-[#f5a524] font-bold text-lg">
                  {signedIn?.email?.[0].toUpperCase() || "U"}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">
                    Signed in as
                  </p>
                  <p className="font-medium text-[#ececf1] text-[13px] truncate max-w-[200px]">
                    {signedIn?.email ?? "your account"}
                  </p>
                </div>
              </div>
              <button
                onClick={onSignOut}
                disabled={busy}
                className="w-full rounded-[10px] border border-[#2b2b33] bg-[#17171b] px-4 py-[10px] text-[12.5px] font-bold uppercase tracking-[0.08em] hover:border-[rgba(245,165,36,0.35)] hover:text-[#f5a524] transition-colors disabled:opacity-60"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <button
                onClick={onGoogle}
                disabled={busy}
                className="flex items-center justify-center gap-3 rounded-[10px] border border-[#2b2b33] bg-[#17171b] px-4 py-[14px] text-[13.5px] font-bold transition-colors hover:border-[#34343e] hover:bg-[#1a1a20] disabled:opacity-60 text-[#ececf1]"
              >
                <GoogleGlyph />
                Continue with Google
              </button>

              <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">
                <span className="h-px flex-1 bg-[#232329]" />
                OR
                <span className="h-px flex-1 bg-[#232329]" />
              </div>

              <form onSubmit={onEmail} className="flex flex-col gap-4">
                <div className="space-y-[6px]">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-[10px] font-[IBM_Plex_Mono,monospace] text-[13px] text-[#ececf1] outline-none placeholder:text-[#5c5c66] focus:border-[rgba(245,165,36,0.35)] transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                <div className="space-y-[6px]">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">
                      Password
                    </label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={onForgotPassword}
                        disabled={busy}
                        className="text-[11px] font-semibold text-[#f5a524] hover:text-[#ffc45e] transition-colors"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      className="w-full rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-[10px] font-[IBM_Plex_Mono,monospace] text-[13px] pr-10 text-[#ececf1] outline-none placeholder:tracking-normal placeholder:text-[#5c5c66] focus:border-[rgba(245,165,36,0.35)] transition-colors"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#5c5c66] hover:text-[#ececf1] transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-[10px] bg-[rgba(255,92,92,0.1)] border border-[#ff5c5c]/20 p-3 text-[12.5px] text-[#ff5c5c]">
                    {error}
                  </div>
                )}
                {resetMsg && (
                  <div className="rounded-[10px] bg-[rgba(47,213,117,0.1)] border border-[#2fd575]/20 p-3 text-[12.5px] text-[#2fd575]">
                    {resetMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 w-full rounded-[11px] bg-[#f5a524] px-4 py-[14px] text-[14.5px] font-bold tracking-[0.02em] text-[#160e00] transition-[filter] hover:brightness-110 disabled:opacity-70 disabled:pointer-events-none"
                >
                  {busy ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
                </button>
              </form>

              <div className="mt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signup" ? "signin" : "signup");
                    setError(null);
                    setResetMsg(null);
                  }}
                  className="text-[12.5px] text-[#83838e] hover:text-[#ececf1] transition-colors"
                >
                  {mode === "signup"
                    ? "Already have an account? Sign in"
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
