-- Restrict the auth_user_id column on public.players from anonymous viewers.
-- The RLS SELECT policy stays "USING (true)" so any row is visible, but
-- column-level privileges hide the sensitive linkage from anon while
-- keeping every other public profile field readable.
REVOKE SELECT ON public.players FROM anon;
GRANT SELECT (
  id, name, created_at, updated_at, country, onboarded_at,
  bio, avatar_color, avatar_url, name_changed_at
) ON public.players TO anon;
-- Authenticated users and service_role keep full column access via existing grants.