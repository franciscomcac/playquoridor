-- Hide the account-linkage column (auth_user_id) from anonymous readers on
-- the three remaining public-readable tables, matching the pattern already
-- applied to public.players. Rows stay publicly visible; the column does not.
REVOKE SELECT ON public.player_stats FROM anon;
GRANT SELECT (
  player_id, matches, wins, losses, pawns_eliminated, walls_placed,
  forfeits, updated_at, rating, ranked_matches, ranked_wins, ranked_losses
) ON public.player_stats TO anon;

REVOKE SELECT ON public.match_players FROM anon;
GRANT SELECT (
  match_id, slot, player_id, name, result, rounds_won,
  walls_placed, pawns_eliminated, forfeited
) ON public.match_players TO anon;

REVOKE SELECT ON public.open_rooms FROM anon;
GRANT SELECT (
  code, mode, host_name, seats_taken, seats_total, created_at, updated_at, ranked
) ON public.open_rooms TO anon;
