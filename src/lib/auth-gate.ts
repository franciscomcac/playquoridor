import { supabase } from "@/integrations/supabase/client";

// Client-side "must be a real signed-in user" check. Returns the profile if
// the user is signed in with a non-anonymous session, else null. Callers use
// this in a useEffect to redirect anonymous / guest users to /auth.
export async function requireRealUser(): Promise<
  | { authUserId: string; email: string | null; playerId: string; username: string; country: string | null }
  | null
> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  const anon = !u || u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
  if (!u || anon) return null;
  const { data: p } = await supabase
    .from("players")
    .select("id,name,country,onboarded_at")
    .eq("auth_user_id", u.id)
    .not("onboarded_at", "is", null)
    .order("onboarded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!p) return null;
  return {
    authUserId: u.id,
    email: u.email ?? null,
    playerId: p.id,
    username: p.name,
    country: p.country ?? null,
  };
}