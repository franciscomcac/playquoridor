import { supabase } from "@/integrations/supabase/client";

// Returns true if the current auth user has completed onboarding (permanent
// username + country). Anonymous sessions always resolve to false.
export async function isOnboarded(): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const u = userData.user;
    if (!u) return false;
    const isAnon = u.is_anonymous === true || (u.app_metadata?.provider ?? "") === "anonymous";
    if (isAnon) return false;
    const { data, error } = await supabase
      .from("players")
      .select("onboarded_at,name,country")
      .eq("auth_user_id", u.id)
      .not("onboarded_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data?.onboarded_at;
  } catch {
    return false;
  }
}

export async function fetchMyProfile(): Promise<{
  username: string;
  country: string | null;
  playerId: string;
} | null> {
  const { data: userData } = await supabase.auth.getUser();
  const u = userData.user;
  if (!u) return null;
  const { data } = await supabase
    .from("players")
    .select("id,name,country,onboarded_at")
    .eq("auth_user_id", u.id)
    .not("onboarded_at", "is", null)
    .order("onboarded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { username: data.name, country: data.country, playerId: data.id };
}
