CREATE OR REPLACE FUNCTION public.apply_elo_1v1(_winner_player_id uuid, _winner_name text, _loser_player_id uuid, _loser_name text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _wr integer;
  _lr integer;
  _wm integer;
  _lm integer;
  _expected_w numeric;
  _delta integer;
  _k integer;
  _placement_games constant integer := 5;
  _k_normal constant integer := 32;
  _k_placement constant integer := 64;
  _winner_is_fallback boolean := _winner_player_id IN (
    'b0700000-0000-4000-8000-000000000700'::uuid,
    'b0900000-0000-4000-8000-000000000900'::uuid,
    'b1100000-0000-4000-8000-000000001100'::uuid,
    'b1300000-0000-4000-8000-000000001300'::uuid,
    'b1500000-0000-4000-8000-000000001500'::uuid,
    'b1700000-0000-4000-8000-000000001700'::uuid
  );
  _loser_is_fallback boolean := _loser_player_id IN (
    'b0700000-0000-4000-8000-000000000700'::uuid,
    'b0900000-0000-4000-8000-000000000900'::uuid,
    'b1100000-0000-4000-8000-000000001100'::uuid,
    'b1300000-0000-4000-8000-000000001300'::uuid,
    'b1500000-0000-4000-8000-000000001500'::uuid,
    'b1700000-0000-4000-8000-000000001700'::uuid
  );
BEGIN
  IF _winner_player_id IS NULL OR _loser_player_id IS NULL THEN
    RAISE EXCEPTION 'player ids required';
  END IF;
  IF _winner_player_id = _loser_player_id THEN
    RAISE EXCEPTION 'winner and loser must differ';
  END IF;

  INSERT INTO public.player_stats (player_id, auth_user_id, updated_at)
  VALUES (_winner_player_id, NULL, now())
  ON CONFLICT (player_id) DO NOTHING;
  INSERT INTO public.player_stats (player_id, auth_user_id, updated_at)
  VALUES (_loser_player_id, NULL, now())
  ON CONFLICT (player_id) DO NOTHING;

  SELECT rating, ranked_matches INTO _wr, _wm FROM public.player_stats WHERE player_id = _winner_player_id FOR UPDATE;
  SELECT rating, ranked_matches INTO _lr, _lm FROM public.player_stats WHERE player_id = _loser_player_id FOR UPDATE;

  _expected_w := 1.0 / (1.0 + power(10.0, (_lr - _wr)::numeric / 400.0));
  IF _wm < _placement_games OR _lm < _placement_games THEN
    _k := _k_placement;
  ELSE
    _k := _k_normal;
  END IF;
  _delta := round(_k * (1.0 - _expected_w));
  IF _delta < 1 THEN _delta := 1; END IF;

  UPDATE public.player_stats
    SET rating = rating + _delta,
        ranked_matches = ranked_matches + CASE WHEN _winner_is_fallback THEN 0 ELSE 1 END,
        ranked_wins = ranked_wins + CASE WHEN _winner_is_fallback THEN 0 ELSE 1 END,
        updated_at = now()
  WHERE player_id = _winner_player_id;

  UPDATE public.player_stats
    SET rating = GREATEST(100, rating - _delta),
        ranked_matches = ranked_matches + CASE WHEN _loser_is_fallback THEN 0 ELSE 1 END,
        ranked_losses = ranked_losses + CASE WHEN _loser_is_fallback THEN 0 ELSE 1 END,
        updated_at = now()
  WHERE player_id = _loser_player_id;

  INSERT INTO public.players (id, name, auth_user_id, updated_at)
  VALUES (_winner_player_id, COALESCE(NULLIF(btrim(_winner_name), ''), 'Player'),
          CASE WHEN _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.players WHERE id = _winner_player_id AND auth_user_id = _uid) THEN _uid ELSE NULL END,
          now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.players (id, name, auth_user_id, updated_at)
  VALUES (_loser_player_id, COALESCE(NULLIF(btrim(_loser_name), ''), 'Player'),
          CASE WHEN _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.players WHERE id = _loser_player_id AND auth_user_id = _uid) THEN _uid ELSE NULL END,
          now())
  ON CONFLICT (id) DO NOTHING;

  RETURN _delta;
END;
$function$;