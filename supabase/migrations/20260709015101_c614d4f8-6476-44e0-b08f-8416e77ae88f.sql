
CREATE OR REPLACE FUNCTION public.evaluate_match_achievements(
  _player_id uuid,
  _mode smallint,
  _ranked boolean,
  _i_won boolean,
  _forfeited boolean,
  _walls_this_match integer,
  _pawns_this_match integer,
  _opponent_rating integer
)
RETURNS TABLE(slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _stats public.player_stats%ROWTYPE;
  _streak integer := 0;
  _mode_matches integer := 0;
  _cand text;
  _thresh integer;
  _did boolean;
  _rec RECORD;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = _player_id AND auth_user_id = _uid) THEN
    RETURN;
  END IF;

  SELECT * INTO _stats FROM public.player_stats WHERE player_id = _player_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Current consecutive-wins streak (most recent finished matches for this player).
  SELECT COUNT(*) INTO _streak
  FROM (
    SELECT mp.result,
           SUM(CASE WHEN mp.result <> 'win' THEN 1 ELSE 0 END)
             OVER (ORDER BY m.ended_at DESC) AS loss_run
    FROM public.match_players mp
    JOIN public.matches m ON m.id = mp.match_id
    WHERE mp.player_id = _player_id
    ORDER BY m.ended_at DESC
    LIMIT 100
  ) x
  WHERE x.loss_run = 0 AND x.result = 'win';

  -- Count of finished matches in this mode for the mode_* badges.
  SELECT COUNT(*) INTO _mode_matches
  FROM public.match_players mp
  JOIN public.matches m ON m.id = mp.match_id
  WHERE mp.player_id = _player_id AND m.mode = _mode;

  -- Helper: try to grant, remember slug when actually inserted.
  CREATE TEMP TABLE IF NOT EXISTS _granted (s text) ON COMMIT DROP;
  DELETE FROM _granted;

  -- Debut ---------------------------------------------------------------
  IF _stats.matches >= 1 THEN
    SELECT public.grant_achievement(_player_id, 'first_step') INTO _did;
    IF _did THEN INSERT INTO _granted VALUES ('first_step'); END IF;
  END IF;

  IF _i_won AND _stats.wins >= 1 THEN
    SELECT public.grant_achievement(_player_id, 'first_blood') INTO _did;
    IF _did THEN INSERT INTO _granted VALUES ('first_blood'); END IF;
  END IF;

  IF _stats.walls_placed >= 1 THEN
    SELECT public.grant_achievement(_player_id, 'first_wall') INTO _did;
    IF _did THEN INSERT INTO _granted VALUES ('first_wall'); END IF;
  END IF;

  -- Wins ----------------------------------------------------------------
  FOR _cand, _thresh IN
    SELECT s, t FROM (VALUES
      ('win_10', 10), ('win_50', 50), ('win_100', 100),
      ('win_500', 500), ('win_1000', 1000)
    ) v(s, t)
  LOOP
    IF _stats.wins >= _thresh THEN
      SELECT public.grant_achievement(_player_id, _cand) INTO _did;
      IF _did THEN INSERT INTO _granted VALUES (_cand); END IF;
    END IF;
  END LOOP;

  -- Streaks -------------------------------------------------------------
  FOR _cand, _thresh IN
    SELECT s, t FROM (VALUES
      ('streak_3', 3), ('streak_5', 5), ('streak_10', 10), ('streak_20', 20)
    ) v(s, t)
  LOOP
    IF _streak >= _thresh THEN
      SELECT public.grant_achievement(_player_id, _cand) INTO _did;
      IF _did THEN INSERT INTO _granted VALUES (_cand); END IF;
    END IF;
  END LOOP;

  -- Rank (ranked only, placement complete) ------------------------------
  IF _ranked AND _stats.ranked_matches >= 5 THEN
    FOR _cand, _thresh IN
      SELECT s, t FROM (VALUES
        ('rank_1200', 1200), ('rank_1400', 1400), ('rank_1600', 1600),
        ('rank_1800', 1800), ('rank_2000', 2000), ('rank_2200', 2200)
      ) v(s, t)
    LOOP
      IF _stats.rating >= _thresh THEN
        SELECT public.grant_achievement(_player_id, _cand) INTO _did;
        IF _did THEN INSERT INTO _granted VALUES (_cand); END IF;
      END IF;
    END LOOP;
  END IF;

  -- Milestones ----------------------------------------------------------
  FOR _cand, _thresh IN
    SELECT s, t FROM (VALUES
      ('matches_10', 10), ('matches_100', 100),
      ('matches_500', 500), ('matches_2000', 2000)
    ) v(s, t)
  LOOP
    IF _stats.matches >= _thresh THEN
      SELECT public.grant_achievement(_player_id, _cand) INTO _did;
      IF _did THEN INSERT INTO _granted VALUES (_cand); END IF;
    END IF;
  END LOOP;

  -- Walls ---------------------------------------------------------------
  FOR _cand, _thresh IN
    SELECT s, t FROM (VALUES
      ('walls_100', 100), ('walls_500', 500), ('walls_2000', 2000)
    ) v(s, t)
  LOOP
    IF _stats.walls_placed >= _thresh THEN
      SELECT public.grant_achievement(_player_id, _cand) INTO _did;
      IF _did THEN INSERT INTO _granted VALUES (_cand); END IF;
    END IF;
  END LOOP;

  -- Skill triggers (require a win this match) ---------------------------
  IF _i_won AND NOT _forfeited THEN
    IF _walls_this_match = 0 THEN
      SELECT public.grant_achievement(_player_id, 'minimalist') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('minimalist'); END IF;
    END IF;
    IF _walls_this_match = 1 THEN
      SELECT public.grant_achievement(_player_id, 'one_wall_win') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('one_wall_win'); END IF;
    END IF;
    IF _mode = 4 AND _pawns_this_match = 0 THEN
      SELECT public.grant_achievement(_player_id, 'pacifist') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('pacifist'); END IF;
    END IF;
    IF _ranked AND _mode = 2 AND _opponent_rating IS NOT NULL
       AND _opponent_rating >= _stats.rating + 200 THEN
      SELECT public.grant_achievement(_player_id, 'giant_slayer') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('giant_slayer'); END IF;
    END IF;
    IF _mode = 4 THEN
      SELECT public.grant_achievement(_player_id, 'four_way_champion') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('four_way_champion'); END IF;
    END IF;
  END IF;

  -- Mode-specific counts ------------------------------------------------
  IF _mode = 2 AND _mode_matches >= 50 THEN
    SELECT public.grant_achievement(_player_id, 'mode_2p_50') INTO _did;
    IF _did THEN INSERT INTO _granted VALUES ('mode_2p_50'); END IF;
  END IF;
  IF _mode = 4 THEN
    IF _mode_matches >= 25 THEN
      SELECT public.grant_achievement(_player_id, 'mode_4p_25') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('mode_4p_25'); END IF;
    END IF;
    IF _mode_matches >= 100 THEN
      SELECT public.grant_achievement(_player_id, 'mode_4p_100') INTO _did;
      IF _did THEN INSERT INTO _granted VALUES ('mode_4p_100'); END IF;
    END IF;
  END IF;

  FOR _rec IN SELECT s FROM _granted LOOP
    slug := _rec.s;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_match_achievements(uuid, smallint, boolean, boolean, boolean, integer, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.evaluate_match_achievements(uuid, smallint, boolean, boolean, boolean, integer, integer, integer) TO authenticated;
