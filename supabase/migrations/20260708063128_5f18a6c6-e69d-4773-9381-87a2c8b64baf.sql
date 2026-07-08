DROP FUNCTION IF EXISTS public.apply_elo_1v1(uuid, text, uuid, text);

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
  _expected_w numeric;
  _delta integer;
  _k constant integer := 32;
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

  SELECT rating INTO _wr FROM public.player_stats WHERE player_id = _winner_player_id FOR UPDATE;
  SELECT rating INTO _lr FROM public.player_stats WHERE player_id = _loser_player_id FOR UPDATE;

  _expected_w := 1.0 / (1.0 + power(10.0, (_lr - _wr)::numeric / 400.0));
  _delta := round(_k * (1.0 - _expected_w));
  IF _delta < 1 THEN _delta := 1; END IF;

  UPDATE public.player_stats
    SET rating = rating + _delta,
        ranked_matches = ranked_matches + 1,
        ranked_wins = ranked_wins + 1,
        updated_at = now()
  WHERE player_id = _winner_player_id;

  UPDATE public.player_stats
    SET rating = GREATEST(100, rating - _delta),
        ranked_matches = ranked_matches + 1,
        ranked_losses = ranked_losses + 1,
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

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS elo_delta integer;