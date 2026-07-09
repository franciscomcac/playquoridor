-- Roles (secure, separate from profiles)
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Helper: is the current user currently chat-banned?
CREATE OR REPLACE FUNCTION public.is_chat_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moderation_penalties
    WHERE auth_user_id = auth.uid()
      AND kind IN ('chat_ban_24h','chat_ban_7d','perm')
      AND (active_until IS NULL OR active_until > now())
  );
$$;

-- Categories (fixed set, seeded)
CREATE TABLE public.forum_categories (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_categories TO anon, authenticated;
GRANT ALL ON public.forum_categories TO service_role;
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.forum_categories FOR SELECT USING (true);

INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
  ('strategy',   'Strategy',    'Openings, tactics, endgames.',            1),
  ('rules',      'Rules',       'Rules clarifications and edge cases.',    2),
  ('off-topic',  'Off-topic',   'Anything else — keep it friendly.',       3),
  ('bug-reports','Bug reports', 'Report bugs and site issues here.',       4);

-- Threads
CREATE TABLE public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug text NOT NULL REFERENCES public.forum_categories(slug),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 140),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  pinned boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  reply_count int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_threads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_threads TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads public read" ON public.forum_threads FOR SELECT USING (true);
CREATE POLICY "threads insert signed in and not banned" ON public.forum_threads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND NOT public.is_chat_banned());
CREATE POLICY "threads update own within 30m or admin" ON public.forum_threads
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = author_id AND created_at > now() - interval '30 minutes' AND NOT locked)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  )
  WITH CHECK (
    (auth.uid() = author_id AND NOT locked)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );
CREATE POLICY "threads delete own or admin" ON public.forum_threads
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE INDEX forum_threads_category_activity_idx
  ON public.forum_threads (category_slug, pinned DESC, last_activity_at DESC);

-- Posts (replies)
CREATE TABLE public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT ALL ON public.forum_posts TO service_role;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts public read" ON public.forum_posts FOR SELECT USING (true);
CREATE POLICY "posts insert if thread unlocked and not banned" ON public.forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND NOT public.is_chat_banned()
    AND EXISTS (SELECT 1 FROM public.forum_threads t WHERE t.id = thread_id AND NOT t.locked)
  );
CREATE POLICY "posts update own within 30m or admin" ON public.forum_posts
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = author_id AND created_at > now() - interval '30 minutes')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  )
  WITH CHECK (
    auth.uid() = author_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );
CREATE POLICY "posts delete own or admin" ON public.forum_posts
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE INDEX forum_posts_thread_created_idx ON public.forum_posts (thread_id, created_at ASC);

-- Keep thread stats fresh
CREATE OR REPLACE FUNCTION public.forum_bump_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_threads
       SET reply_count = reply_count + 1,
           last_activity_at = NEW.created_at,
           updated_at = now()
     WHERE id = NEW.thread_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_threads
       SET reply_count = GREATEST(0, reply_count - 1),
           updated_at = now()
     WHERE id = OLD.thread_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER forum_posts_bump_thread
AFTER INSERT OR DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_bump_thread();

CREATE TRIGGER forum_threads_touch BEFORE UPDATE ON public.forum_threads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER forum_posts_touch BEFORE UPDATE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();