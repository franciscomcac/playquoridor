
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE TABLE IF NOT EXISTS public.moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  auth_user_id uuid,
  surface text NOT NULL CHECK (surface IN ('bio','avatar','chat','name')),
  content text,
  categories text[] NOT NULL DEFAULT '{}',
  severity smallint NOT NULL DEFAULT 0,
  verdict text NOT NULL CHECK (verdict IN ('ok','flagged','blocked')),
  match_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_events TO authenticated;
GRANT ALL ON public.moderation_events TO service_role;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events readable" ON public.moderation_events
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS moderation_events_player_time_idx
  ON public.moderation_events (player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  auth_user_id uuid,
  kind text NOT NULL CHECK (kind IN ('warn','match_mute','chat_ban_24h','chat_ban_7d','perm')),
  reason text,
  match_id text,
  active_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_penalties TO authenticated;
GRANT ALL ON public.moderation_penalties TO service_role;
ALTER TABLE public.moderation_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own penalties readable" ON public.moderation_penalties
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS moderation_penalties_player_active_idx
  ON public.moderation_penalties (player_id, active_until DESC);

CREATE OR REPLACE FUNCTION public.my_active_chat_ban()
RETURNS TABLE(kind text, active_until timestamptz, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kind, active_until, reason
  FROM public.moderation_penalties
  WHERE auth_user_id = auth.uid()
    AND kind IN ('chat_ban_24h','chat_ban_7d','perm')
    AND (active_until IS NULL OR active_until > now())
  ORDER BY active_until DESC NULLS FIRST
  LIMIT 1;
$$;
