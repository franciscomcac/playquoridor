-- Restrict SELECT on the auth_user_id column of match_players and player_stats
-- so anonymous / authenticated users can no longer correlate match history
-- or ratings to specific auth accounts. All other columns remain readable
-- under the existing RLS policies; the app itself never selects these
-- columns from these two tables.

REVOKE SELECT (auth_user_id) ON public.match_players FROM anon, authenticated;
REVOKE SELECT (auth_user_id) ON public.player_stats  FROM anon, authenticated;

-- service_role retains ALL access (used by admin / edge functions).
GRANT SELECT (auth_user_id) ON public.match_players TO service_role;
GRANT SELECT (auth_user_id) ON public.player_stats  TO service_role;
