-- 0. Dedupe pre-existing onboarded name collisions before adding the unique index.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY lower(name) ORDER BY onboarded_at ASC, created_at ASC, id ASC
  ) AS rn
  FROM public.players
  WHERE onboarded_at IS NOT NULL
)
UPDATE public.players p
   SET onboarded_at = NULL, updated_at = now()
  FROM ranked r
 WHERE p.id = r.id AND r.rn > 1;

-- 1. Unique index on onboarded player names (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS players_name_unique_onboarded
  ON public.players (lower(name)) WHERE onboarded_at IS NOT NULL;

-- 2. Harden complete_onboarding: reject taken usernames + require alnum/underscore.
CREATE OR REPLACE FUNCTION public.complete_onboarding(_player_id uuid, _name text, _country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing_auth uuid;
  _clean text := btrim(_name);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _clean IS NULL OR length(_clean) < 3 OR length(_clean) > 16 THEN
    RAISE EXCEPTION 'Invalid name' USING ERRCODE = '22023';
  END IF;
  IF _clean !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Username may only contain letters, numbers and underscores' USING ERRCODE = '22023';
  END IF;
  IF _country IS NULL OR length(_country) < 2 OR length(_country) > 4 THEN
    RAISE EXCEPTION 'Invalid country' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.players
    WHERE lower(name) = lower(_clean)
      AND onboarded_at IS NOT NULL
      AND (auth_user_id IS NULL OR auth_user_id <> _uid)
  ) THEN
    RAISE EXCEPTION 'Username is taken' USING ERRCODE = '23505';
  END IF;

  SELECT auth_user_id INTO _existing_auth FROM public.players WHERE id = _player_id;
  IF _existing_auth IS NOT NULL AND _existing_auth <> _uid THEN
    INSERT INTO public.players (id, name, auth_user_id, country, onboarded_at, updated_at)
    VALUES (gen_random_uuid(), _clean, _uid, _country, now(), now());
    RETURN;
  END IF;

  INSERT INTO public.players (id, name, auth_user_id, country, onboarded_at, updated_at)
  VALUES (_player_id, _clean, _uid, _country, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        auth_user_id = _uid,
        country = EXCLUDED.country,
        onboarded_at = COALESCE(public.players.onboarded_at, now()),
        updated_at = now();
END;
$function$;

-- 3. Friendships table
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  requester_auth uuid NOT NULL,
  addressee_auth uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships read participants" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_auth OR auth.uid() = addressee_auth);

CREATE POLICY "friendships insert as requester" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_auth);

CREATE POLICY "friendships update addressee accept" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_auth OR auth.uid() = requester_auth)
  WITH CHECK (auth.uid() = addressee_auth OR auth.uid() = requester_auth);

CREATE POLICY "friendships delete participants" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = requester_auth OR auth.uid() = addressee_auth);

CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships (addressee_auth, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_auth, status);

-- 4. Saved clips
CREATE TABLE IF NOT EXISTS public.saved_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_auth uuid NOT NULL,
  owner_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  title text NOT NULL,
  mode smallint NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_clips TO authenticated;
GRANT ALL ON public.saved_clips TO service_role;

ALTER TABLE public.saved_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clips read own" ON public.saved_clips
  FOR SELECT TO authenticated USING (auth.uid() = owner_auth);
CREATE POLICY "clips insert own" ON public.saved_clips
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_auth);
CREATE POLICY "clips delete own" ON public.saved_clips
  FOR DELETE TO authenticated USING (auth.uid() = owner_auth);

CREATE INDEX IF NOT EXISTS saved_clips_owner_idx ON public.saved_clips (owner_auth, created_at DESC);

-- 5. Public username availability check
CREATE OR REPLACE FUNCTION public.check_username_available(_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE lower(name) = lower(btrim(_name))
      AND onboarded_at IS NOT NULL
  );
$function$;

GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

-- 6. Friends search helper (public, tightly-scoped)
CREATE OR REPLACE FUNCTION public.search_players(_q text, _limit int DEFAULT 10)
 RETURNS TABLE(player_id uuid, name text, country text, auth_user_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, country, auth_user_id
  FROM public.players
  WHERE onboarded_at IS NOT NULL
    AND auth_user_id IS NOT NULL
    AND (name ILIKE (btrim(_q) || '%') OR name ILIKE ('%' || btrim(_q) || '%'))
  ORDER BY (name ILIKE (btrim(_q) || '%')) DESC, name ASC
  LIMIT LEAST(GREATEST(_limit, 1), 25);
$function$;

GRANT EXECUTE ON FUNCTION public.search_players(text, int) TO authenticated;
