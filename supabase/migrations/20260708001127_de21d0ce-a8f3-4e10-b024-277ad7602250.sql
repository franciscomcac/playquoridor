CREATE TABLE public.puzzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_date date NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Daily Puzzle',
  mode smallint NOT NULL DEFAULT 2,
  pawns jsonb NOT NULL,
  walls jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_player smallint NOT NULL DEFAULT 0,
  goal_moves smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX puzzles_date_idx ON public.puzzles (puzzle_date);

GRANT SELECT ON public.puzzles TO anon, authenticated;
GRANT ALL ON public.puzzles TO service_role;

ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "puzzles are public" ON public.puzzles
  FOR SELECT
  TO anon, authenticated
  USING (true);
