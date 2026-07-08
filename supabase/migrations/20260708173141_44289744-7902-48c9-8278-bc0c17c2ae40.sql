
INSERT INTO public.players (id, name, auth_user_id, onboarded_at, updated_at)
VALUES
  ('b0700000-0000-4000-8000-000000000700', 'Novice_Bot',  NULL, NULL, now()),
  ('b0900000-0000-4000-8000-000000000900', 'Casual_Bot',  NULL, NULL, now()),
  ('b1100000-0000-4000-8000-000000001100', 'Steady_Bot',  NULL, NULL, now()),
  ('b1300000-0000-4000-8000-000000001300', 'Sharp_Bot',   NULL, NULL, now()),
  ('b1500000-0000-4000-8000-000000001500', 'Expert_Bot',  NULL, NULL, now()),
  ('b1700000-0000-4000-8000-000000001700', 'Master_Bot',  NULL, NULL, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.player_stats
  (player_id, rating, ranked_matches, ranked_wins, ranked_losses, matches, wins, losses, updated_at)
VALUES
  ('b0700000-0000-4000-8000-000000000700', 700,  40, 20, 20, 40, 20, 20, now()),
  ('b0900000-0000-4000-8000-000000000900', 900,  40, 20, 20, 40, 20, 20, now()),
  ('b1100000-0000-4000-8000-000000001100', 1100, 40, 20, 20, 40, 20, 20, now()),
  ('b1300000-0000-4000-8000-000000001300', 1300, 40, 20, 20, 40, 20, 20, now()),
  ('b1500000-0000-4000-8000-000000001500', 1500, 40, 20, 20, 40, 20, 20, now()),
  ('b1700000-0000-4000-8000-000000001700', 1700, 40, 20, 20, 40, 20, 20, now())
ON CONFLICT (player_id) DO NOTHING;
