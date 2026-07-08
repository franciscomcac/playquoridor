-- 1. Add auth linkage columns (nullable so existing rows remain valid).
ALTER TABLE public.players       ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.player_stats  ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.open_rooms    ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.match_players ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE INDEX IF NOT EXISTS players_auth_user_id_idx       ON public.players(auth_user_id);
CREATE INDEX IF NOT EXISTS player_stats_auth_user_id_idx  ON public.player_stats(auth_user_id);
CREATE INDEX IF NOT EXISTS open_rooms_auth_user_id_idx    ON public.open_rooms(auth_user_id);
CREATE INDEX IF NOT EXISTS match_players_auth_user_id_idx ON public.match_players(auth_user_id);

-- 2. Revoke write access from anon; only signed-in clients may mutate.
REVOKE INSERT, UPDATE, DELETE ON public.players       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.player_stats  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.open_rooms    FROM anon;
REVOKE INSERT                  ON public.matches       FROM anon;
REVOKE INSERT                  ON public.match_players FROM anon;
GRANT  SELECT ON public.players       TO anon;
GRANT  SELECT ON public.player_stats  TO anon;
GRANT  SELECT ON public.open_rooms    TO anon;
GRANT  SELECT ON public.matches       TO anon;
GRANT  SELECT ON public.match_players TO anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.players       TO authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.player_stats  TO authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.open_rooms    TO authenticated;
GRANT  SELECT, INSERT                 ON public.matches       TO authenticated;
GRANT  SELECT, INSERT                 ON public.match_players TO authenticated;

-- 3. players policies.
DROP POLICY IF EXISTS "players insert" ON public.players;
DROP POLICY IF EXISTS "players read"   ON public.players;
DROP POLICY IF EXISTS "players update" ON public.players;
CREATE POLICY "players read"        ON public.players FOR SELECT USING (true);
CREATE POLICY "players self insert" ON public.players FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "players self update" ON public.players FOR UPDATE TO authenticated
  USING       (auth_user_id IS NULL OR auth_user_id = auth.uid())
  WITH CHECK  (auth_user_id = auth.uid());

-- 4. player_stats policies.
DROP POLICY IF EXISTS "stats insert" ON public.player_stats;
DROP POLICY IF EXISTS "stats read"   ON public.player_stats;
DROP POLICY IF EXISTS "stats update" ON public.player_stats;
CREATE POLICY "stats read"        ON public.player_stats FOR SELECT USING (true);
CREATE POLICY "stats self insert" ON public.player_stats FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "stats self update" ON public.player_stats FOR UPDATE TO authenticated
  USING       (auth_user_id IS NULL OR auth_user_id = auth.uid())
  WITH CHECK  (auth_user_id = auth.uid());

-- 5. matches policies.
DROP POLICY IF EXISTS "matches insert" ON public.matches;
DROP POLICY IF EXISTS "matches read"   ON public.matches;
CREATE POLICY "matches read"      ON public.matches FOR SELECT USING (true);
CREATE POLICY "matches auth ins"  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 6. match_players policies.
DROP POLICY IF EXISTS "mp insert" ON public.match_players;
DROP POLICY IF EXISTS "mp read"   ON public.match_players;
CREATE POLICY "mp read"        ON public.match_players FOR SELECT USING (true);
CREATE POLICY "mp auth insert" ON public.match_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL
              AND (auth_user_id IS NULL OR auth_user_id = auth.uid()));

-- 7. open_rooms policies.
DROP POLICY IF EXISTS "rooms insert" ON public.open_rooms;
DROP POLICY IF EXISTS "rooms read"   ON public.open_rooms;
DROP POLICY IF EXISTS "rooms update" ON public.open_rooms;
DROP POLICY IF EXISTS "rooms delete" ON public.open_rooms;
CREATE POLICY "rooms read"        ON public.open_rooms FOR SELECT USING (true);
CREATE POLICY "rooms self insert" ON public.open_rooms FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "rooms self update" ON public.open_rooms FOR UPDATE TO authenticated
  USING       (auth_user_id IS NULL OR auth_user_id = auth.uid())
  WITH CHECK  (auth_user_id = auth.uid());
CREATE POLICY "rooms self delete" ON public.open_rooms FOR DELETE TO authenticated
  USING       (auth_user_id IS NULL OR auth_user_id = auth.uid());