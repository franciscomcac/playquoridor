
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS name_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.rename_player(_player_id uuid, _new_name text)
RETURNS TABLE(ok boolean, next_allowed_at timestamptz, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _clean text := btrim(_new_name);
  _row public.players%ROWTYPE;
  _next timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'Not signed in'; RETURN;
  END IF;
  IF _clean IS NULL OR length(_clean) < 3 OR length(_clean) > 16 OR _clean !~ '^[a-zA-Z0-9_]+$' THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'Name must be 3-16 chars: letters, numbers, underscore'; RETURN;
  END IF;

  SELECT * INTO _row FROM public.players WHERE id = _player_id AND auth_user_id = _uid;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'Player not found'; RETURN;
  END IF;

  IF lower(_row.name) = lower(_clean) THEN
    RETURN QUERY SELECT true, _row.name_changed_at + interval '30 days', 'No change'; RETURN;
  END IF;

  IF _row.name_changed_at IS NOT NULL AND _row.name_changed_at > now() - interval '30 days' THEN
    _next := _row.name_changed_at + interval '30 days';
    RETURN QUERY SELECT false, _next, 'You can change your display name again on ' || to_char(_next, 'YYYY-MM-DD'); RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.players
    WHERE lower(name) = lower(_clean)
      AND onboarded_at IS NOT NULL
      AND (auth_user_id IS NULL OR auth_user_id <> _uid)
  ) THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 'Username is taken'; RETURN;
  END IF;

  UPDATE public.players
    SET name = _clean, name_changed_at = now(), updated_at = now()
  WHERE id = _player_id AND auth_user_id = _uid;

  RETURN QUERY SELECT true, (now() + interval '30 days')::timestamptz, 'Name updated';
END;
$$;
