
-- Tier enum for badge prestige
CREATE TYPE public.achievement_tier AS ENUM ('bronze','silver','gold','platinum','mythic');

-- Catalog of all achievements
CREATE TABLE public.achievements (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tier public.achievement_tier NOT NULL DEFAULT 'bronze',
  category TEXT NOT NULL,
  sigil_key TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Achievements catalog is public"
  ON public.achievements FOR SELECT
  USING (true);

-- Player unlocks
CREATE TABLE public.player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  achievement_slug TEXT NOT NULL REFERENCES public.achievements(slug) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (player_id, achievement_slug)
);

GRANT SELECT ON public.player_achievements TO anon, authenticated;
GRANT ALL ON public.player_achievements TO service_role;

ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Player unlocks are public"
  ON public.player_achievements FOR SELECT
  USING (true);

CREATE INDEX player_achievements_player_idx
  ON public.player_achievements (player_id);

-- Showcase slots on profile (up to 3 pinned badges, ordered)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS showcased_achievements TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Grant helper: awards an achievement to a player if not already unlocked.
-- Returns true when newly granted, false when already held.
CREATE OR REPLACE FUNCTION public.grant_achievement(_player_id UUID, _slug TEXT, _progress JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted BOOLEAN;
BEGIN
  INSERT INTO public.player_achievements (player_id, achievement_slug, progress)
  VALUES (_player_id, _slug, COALESCE(_progress, '{}'::jsonb))
  ON CONFLICT (player_id, achievement_slug) DO NOTHING
  RETURNING true INTO _inserted;

  RETURN COALESCE(_inserted, false);
END;
$$;

-- Update showcase: caller must own the player row. Validates all slugs are
-- unlocked. Max 3.
CREATE OR REPLACE FUNCTION public.set_showcased_achievements(_player_id UUID, _slugs TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _clean TEXT[];
  _s TEXT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = _player_id AND auth_user_id = _uid) THEN
    RAISE EXCEPTION 'Player not found' USING ERRCODE = '42501';
  END IF;

  IF _slugs IS NULL THEN _slugs := '{}'::text[]; END IF;
  IF array_length(_slugs, 1) > 3 THEN
    RAISE EXCEPTION 'At most 3 showcased achievements' USING ERRCODE = '22023';
  END IF;

  -- Dedupe while preserving order
  SELECT array_agg(DISTINCT s ORDER BY s) FROM unnest(_slugs) s INTO _clean;
  -- Actually we want to preserve caller-provided order, so redo:
  _clean := ARRAY[]::text[];
  FOREACH _s IN ARRAY _slugs LOOP
    IF NOT (_s = ANY(_clean)) THEN
      _clean := _clean || _s;
    END IF;
  END LOOP;

  -- Validate every slug is unlocked by this player
  IF EXISTS (
    SELECT 1 FROM unnest(_clean) s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.player_achievements pa
      WHERE pa.player_id = _player_id AND pa.achievement_slug = s
    )
  ) THEN
    RAISE EXCEPTION 'Cannot showcase a locked achievement' USING ERRCODE = '42501';
  END IF;

  UPDATE public.players
    SET showcased_achievements = _clean, updated_at = now()
  WHERE id = _player_id;
END;
$$;

-- updated_at trigger for achievements catalog
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER achievements_touch_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
