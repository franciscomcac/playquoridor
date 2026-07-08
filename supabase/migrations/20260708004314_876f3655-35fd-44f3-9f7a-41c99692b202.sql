
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  _player_id uuid,
  _name text,
  _country text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing_auth uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) < 2 OR length(_name) > 16 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF _country IS NULL OR length(_country) < 2 OR length(_country) > 4 THEN
    RAISE EXCEPTION 'Invalid country';
  END IF;

  SELECT auth_user_id INTO _existing_auth FROM public.players WHERE id = _player_id;

  IF _existing_auth IS NOT NULL AND _existing_auth <> _uid THEN
    -- Row belongs to a different auth user; create a fresh player row for this user instead.
    INSERT INTO public.players (id, name, auth_user_id, country, onboarded_at, updated_at)
    VALUES (gen_random_uuid(), _name, _uid, _country, now(), now());
    RETURN;
  END IF;

  INSERT INTO public.players (id, name, auth_user_id, country, onboarded_at, updated_at)
  VALUES (_player_id, _name, _uid, _country, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        auth_user_id = _uid,
        country = EXCLUDED.country,
        onboarded_at = now(),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding(uuid, text, text) TO authenticated;
