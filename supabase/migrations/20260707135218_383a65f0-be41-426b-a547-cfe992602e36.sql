
-- players
CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.players TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read" ON public.players FOR SELECT USING (true);
CREATE POLICY "players insert" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "players update" ON public.players FOR UPDATE USING (true) WITH CHECK (true);

-- player_stats
CREATE TABLE public.player_stats (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  matches int NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  pawns_eliminated int NOT NULL DEFAULT 0,
  walls_placed int NOT NULL DEFAULT 0,
  forfeits int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.player_stats TO anon, authenticated;
GRANT ALL ON public.player_stats TO service_role;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stats read" ON public.player_stats FOR SELECT USING (true);
CREATE POLICY "stats insert" ON public.player_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "stats update" ON public.player_stats FOR UPDATE USING (true) WITH CHECK (true);

-- matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode int2 NOT NULL,
  rounds int2 NOT NULL,
  winner_player_id uuid REFERENCES public.players(id),
  ended_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches read" ON public.matches FOR SELECT USING (true);
CREATE POLICY "matches insert" ON public.matches FOR INSERT WITH CHECK (true);

-- match_players
CREATE TABLE public.match_players (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  slot int2 NOT NULL,
  player_id uuid REFERENCES public.players(id),
  name text NOT NULL,
  result text NOT NULL,
  rounds_won int NOT NULL DEFAULT 0,
  walls_placed int NOT NULL DEFAULT 0,
  pawns_eliminated int NOT NULL DEFAULT 0,
  forfeited boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, slot)
);
GRANT SELECT, INSERT ON public.match_players TO anon, authenticated;
GRANT ALL ON public.match_players TO service_role;
ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp read" ON public.match_players FOR SELECT USING (true);
CREATE POLICY "mp insert" ON public.match_players FOR INSERT WITH CHECK (true);

-- open_rooms (Quick Match lobby index)
CREATE TABLE public.open_rooms (
  code text PRIMARY KEY,
  mode int2 NOT NULL,
  host_name text NOT NULL,
  seats_taken int NOT NULL DEFAULT 1,
  seats_total int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_rooms TO anon, authenticated;
GRANT ALL ON public.open_rooms TO service_role;
ALTER TABLE public.open_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms read" ON public.open_rooms FOR SELECT USING (true);
CREATE POLICY "rooms insert" ON public.open_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms update" ON public.open_rooms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "rooms delete" ON public.open_rooms FOR DELETE USING (true);

CREATE INDEX idx_open_rooms_mode ON public.open_rooms(mode, seats_taken, created_at);
CREATE INDEX idx_matches_winner ON public.matches(winner_player_id);
CREATE INDEX idx_match_players_player ON public.match_players(player_id);
