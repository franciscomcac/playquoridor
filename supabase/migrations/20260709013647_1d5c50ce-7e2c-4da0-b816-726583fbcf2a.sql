
-- 1. Add bot marker + locked initial rating on players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS initial_rating integer;

-- 2. Mark the 6 legacy bots and backfill initial_rating
UPDATE public.players SET is_bot = true, initial_rating = 700  WHERE id = 'b0700000-0000-4000-8000-000000000700';
UPDATE public.players SET is_bot = true, initial_rating = 900  WHERE id = 'b0900000-0000-4000-8000-000000000900';
UPDATE public.players SET is_bot = true, initial_rating = 1100 WHERE id = 'b1100000-0000-4000-8000-000000001100';
UPDATE public.players SET is_bot = true, initial_rating = 1300 WHERE id = 'b1300000-0000-4000-8000-000000001300';
UPDATE public.players SET is_bot = true, initial_rating = 1500 WHERE id = 'b1500000-0000-4000-8000-000000001500';
UPDATE public.players SET is_bot = true, initial_rating = 1700 WHERE id = 'b1700000-0000-4000-8000-000000001700';

-- 3. Seed 94 new bots (players)
INSERT INTO public.players (id, name, is_bot, initial_rating, onboarded_at, updated_at) VALUES
('10d7aa63-a01a-4c7c-a69f-24c4cb9707b8','neon_edge',true,1157,now(),now()),
('c6735009-6dee-46f7-84f2-d25358756c4c','helix_kin',true,1107,now(),now()),
('6bffc8ad-19c7-4649-81dc-9699fcbb2236','drift_z',true,1052,now(),now()),
('5db8bcde-e410-44bc-8a95-87fe7e560f5e','mirage_hawk',true,2079,now(),now()),
('5d71e92d-dc9a-4654-914e-238be92591e3','storm_tor',true,1413,now(),now()),
('59a06aa7-c252-465c-b240-b487c6c77561','cyber_runa',true,916,now(),now()),
('8fa5b1e2-373f-4ce8-887e-8f984adb2dfc','mirage_kite',true,1282,now(),now()),
('6bb6958b-ac5e-4c31-96a4-cf2a84551789','astro__hd',true,1508,now(),now()),
('dc4c65c3-e9cc-4d51-9862-7d65f139e7de','comet_born',true,1698,now(),now()),
('343cc97d-f713-413d-b74f-50a2de687f42','zen_hawk',true,545,now(),now()),
('792c8e7c-812a-41fb-9d3d-7f8d57c0b0f8','lunar__x',true,839,now(),now()),
('a0d710a2-03e0-438e-96eb-5f2f1518e480','onyx_mist',true,747,now(),now()),
('85aabb27-2395-44b9-8a9b-b771977d47ab','wisp_nyx',true,841,now(),now()),
('74f95290-3dec-41ab-bfd0-76bcf67c9198','storm_vane',true,1218,now(),now()),
('162a9b97-41ed-48d5-8e6f-67ddeb681ee6','wraith_yarn',true,1057,now(),now()),
('f46e7ede-05f9-4f7c-aa74-dc86f8e6a106','onyx_kite',true,553,now(),now()),
('63df3587-23d3-415c-9396-7ef64146bd5d','atlas_jinx',true,480,now(),now()),
('2e17f677-4d11-4e9a-a3df-5eb87d387c02','mirage_xx',true,1391,now(),now()),
('810406fe-b690-4076-9a98-591082e9b729','ghost_born',true,983,now(),now()),
('f21122a1-9b5f-4641-ad52-9583dc3e58d2','zen_99',true,779,now(),now()),
('f7249f42-b1af-4856-9f1a-07280491e767','zen_vane',true,1022,now(),now()),
('0c3ade75-e0c6-4577-820c-8edd0dd46092','nomad_tor',true,1716,now(),now()),
('9170135e-dab1-4884-827a-88c626867f4e','karma77',true,958,now(),now()),
('7f11b3c8-0a8e-4273-a4da-bedf7dd808b7','valkyr_kite',true,1436,now(),now()),
('262cd69a-3b66-4c60-906c-5793ad75cc01','zero_kin',true,753,now(),now()),
('4a089098-3725-429a-ab65-7c95a5d73290','titan_haze',true,1021,now(),now()),
('106caeee-fb86-45a7-b633-16359a692065','drift_77',true,1220,now(),now()),
('463e601c-771c-4be4-9889-aeff6f2a9d24','tide__x',true,1001,now(),now()),
('90e5869c-0354-4c65-b957-b5be80b9c6a0','comet_urn',true,1134,now(),now()),
('f143ef02-0bbd-444a-8053-bdb917d9c3da','hydra_lynx',true,1702,now(),now()),
('bfccbda2-f45b-409c-a04b-24bcfe50cbfa','orb_404',true,670,now(),now()),
('bbf70409-605d-4704-8256-fd335d643223','rift_404',true,1076,now(),now()),
('30be8e03-4dc3-4a82-88a8-b28799e6734e','valkyrlynx',true,1282,now(),now()),
('61ad2ac5-bb95-414f-a82b-897ee1641bb3','mirage_fall',true,1511,now(),now()),
('248c9840-e116-41ab-966e-3033a38a455a','cinder_kin',true,1018,now(),now()),
('206f1779-fe12-47f2-9d36-01b9f1bca873','wisp_jinx',true,1427,now(),now()),
('3ea1975a-0503-4efe-8aa5-109aae829e15','crimson_xis',true,1226,now(),now()),
('b3f9371e-313c-4ee4-810f-580e9b7056a5','ravenzork',true,768,now(),now()),
('db1ed493-0342-4c6d-a0df-d91f352a40a8','jade_urn',true,1510,now(),now()),
('cf0d7531-95c3-45e8-955c-a03ba3744f63','nova_haze',true,1298,now(),now()),
('76bee5c3-8053-4be2-994f-2c931c22a220','shadowkin',true,835,now(),now()),
('b5026843-c3a1-45cd-b31f-5aef48ff448a','quantumvane',true,683,now(),now()),
('81c794eb-3aae-40f2-a312-15d98af3543b','zensage',true,1082,now(),now()),
('dc10d494-3bb7-45c2-a78b-516423d540db','drift_fox',true,844,now(),now()),
('e5694325-d921-46a1-8677-9cb287ae7bb6','pixel_urn',true,1319,now(),now()),
('090d4935-01f2-4d62-ba45-a81ba19d1f45','phantom_99',true,1756,now(),now()),
('71a164f0-173d-4fe2-8685-100bb42e4183','cobalthaze',true,1183,now(),now()),
('6ea31832-1850-42ae-9d3c-082d761d1548','hydra_nyx',true,726,now(),now()),
('0fc9875c-749e-422a-a085-27cea46137d8','shadow_nyx',true,1379,now(),now()),
('b138fb89-6d27-4017-86ea-6651debddb0e','prism_wing',true,1935,now(),now()),
('bcb39bfe-aef1-40d0-a7ac-a9977dca6973','astro_x',true,1470,now(),now()),
('09a37357-a9ea-4a35-becb-1ae4da9e27c2','atlascrest',true,807,now(),now()),
('9c928d70-2edd-4fe9-974d-d274dfa46420','pixel_wolf',true,1421,now(),now()),
('d8859da0-62a9-4cf5-9dff-d4c388162a4c','mirage_404',true,404,now(),now()),
('dfceca9c-6841-469d-8c85-b22288685d79','hydrawing',true,1186,now(),now()),
('749d5932-0592-4f55-9b53-676449caed75','hex_nyx',true,1586,now(),now()),
('d51c749c-29e3-49c6-be23-bf2c6931af61','nomad_haze',true,875,now(),now()),
('515cd5c7-2309-4831-ba74-644a599feba9','fluxkin',true,1287,now(),now()),
('724dcf72-7184-4039-8754-7dfc4ceb250e','ghost99',true,804,now(),now()),
('266cbb75-a6af-4879-8c33-c42dd1b52365','phantomwing',true,1127,now(),now()),
('8af1d474-ebc9-41b1-9e56-d95b1e177008','mach_sage',true,1804,now(),now()),
('4873e5e9-baf7-42b9-8df5-d71734889576','ion_77',true,1481,now(),now()),
('40006e83-8c7c-4aa9-b6e7-21c038518f83','raven_99',true,1835,now(),now()),
('7ee1b1dc-4008-4db2-b194-009c669efdd3','nova_kite',true,1768,now(),now()),
('5fa29f3c-fd96-4c0a-8f01-82b9917b8dbd','ember99',true,1189,now(),now()),
('409035a0-8aba-40e8-990f-35a745bf497f','node_edge',true,828,now(),now()),
('54b22f51-348b-4b04-a62e-f4cde25da3d0','echo_x',true,1390,now(),now()),
('a7ac4ad6-3377-445f-b36f-35c4de3b13ae','phantomlynx',true,589,now(),now()),
('e907f13b-9bc7-4e8e-9248-015c36d9a1b9','cobalt_tor',true,1355,now(),now()),
('2cdb1d16-e1f4-4c1d-9cca-7258d9bd6d86','storm_lynx',true,554,now(),now()),
('bda61fad-df92-4f4f-83a7-2687b43a0bde','vortexvane',true,1170,now(),now()),
('a9071318-8950-4ded-bc96-dc91dedad7fe','astro_quiv',true,950,now(),now()),
('1fe23eb0-018f-4fbf-b68b-899f4b366c9a','zephyrkin',true,1075,now(),now()),
('f13c8e15-09f0-46b7-b457-b81c324126df','wisp_crest',true,2042,now(),now()),
('5bc96b1d-92bd-4500-86cd-2bba65f8895a','crimson_born',true,2042,now(),now()),
('ce7c43e8-cd65-48c9-8e6b-0b7f727b0665','nova_jinx',true,1540,now(),now()),
('8860c066-9555-4bf1-8d0b-47dacaf489ef','quill_hd',true,1004,now(),now()),
('25a2a03a-ba9c-4c85-a285-69bc708a02d4','titanxx',true,1279,now(),now()),
('9fd96599-559f-457b-a19d-4b73506a45cf','quantum_mist',true,1020,now(),now()),
('e043e5ba-d8f6-40d0-a5f6-d6a59181be2b','titan_x',true,1495,now(),now()),
('0ae28883-bd21-4277-bc2b-dbe63c7f6c63','machhawk',true,759,now(),now()),
('3dfead6b-b2f7-468b-8a4d-e2d58782a29e','titan_lark',true,678,now(),now()),
('0e1a784e-7058-46ac-bfce-ef5e3bb2a351','wisp_wolf',true,1714,now(),now()),
('e2f77029-dc5c-47c5-8aee-07e94c32b5b8','onyxlynx',true,1381,now(),now()),
('5bcdb517-1b88-475b-8457-26182c47aa8e','karma_z',true,835,now(),now()),
('cf051951-3245-45d9-8739-eaa0f2541476','node_crest',true,1066,now(),now()),
('dac7f3be-5b6c-4cad-828e-ec39c25343e1','lunar_yarn',true,754,now(),now()),
('4f354fc7-48f4-486a-b7e7-2bb9c760fe65','vulcan_lynx',true,624,now(),now()),
('290e2991-3a50-49fb-b63b-c1a64fcead07','fable_oath',true,1038,now(),now()),
('a5bb4be8-e5af-4a34-895a-660ac116a16c','quill_urn',true,1312,now(),now()),
('34f2acfa-2a70-4716-b196-5e330f3c9b5b','vulcanz',true,1612,now(),now()),
('054edabd-a5db-44b1-be89-4586630e4a3c','valkyrkin',true,1065,now(),now()),
('c3e8f558-c734-42cb-9b8c-5c9a00ac972f','lynx_lark',true,1383,now(),now()),
('cb00ad30-748e-4e4d-ab26-65d93780499f','zephyr_xx',true,1779,now(),now())
ON CONFLICT (id) DO NOTHING;

-- 4. Seed matching player_stats rows for the new bots (rating = initial_rating)
INSERT INTO public.player_stats (player_id, rating, updated_at)
SELECT id, initial_rating, now()
FROM public.players
WHERE is_bot = true
ON CONFLICT (player_id) DO NOTHING;

-- 5. Index for nearest-neighbor bot lookup
CREATE INDEX IF NOT EXISTS idx_player_stats_rating ON public.player_stats(rating);
CREATE INDEX IF NOT EXISTS idx_players_is_bot ON public.players(is_bot) WHERE is_bot = true;

-- 6. Update apply_elo_1v1 to use is_bot flag instead of hardcoded UUID list
CREATE OR REPLACE FUNCTION public.apply_elo_1v1(_winner_player_id uuid, _winner_name text, _loser_player_id uuid, _loser_name text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _wr integer;
  _lr integer;
  _wm integer;
  _lm integer;
  _expected_w numeric;
  _delta integer;
  _k integer;
  _placement_games constant integer := 5;
  _k_normal constant integer := 32;
  _k_placement constant integer := 64;
  _winner_is_bot boolean;
  _loser_is_bot boolean;
BEGIN
  IF _winner_player_id IS NULL OR _loser_player_id IS NULL THEN
    RAISE EXCEPTION 'player ids required';
  END IF;
  IF _winner_player_id = _loser_player_id THEN
    RAISE EXCEPTION 'winner and loser must differ';
  END IF;

  SELECT COALESCE(is_bot,false) INTO _winner_is_bot FROM public.players WHERE id = _winner_player_id;
  SELECT COALESCE(is_bot,false) INTO _loser_is_bot  FROM public.players WHERE id = _loser_player_id;

  INSERT INTO public.player_stats (player_id, auth_user_id, updated_at)
  VALUES (_winner_player_id, NULL, now())
  ON CONFLICT (player_id) DO NOTHING;
  INSERT INTO public.player_stats (player_id, auth_user_id, updated_at)
  VALUES (_loser_player_id, NULL, now())
  ON CONFLICT (player_id) DO NOTHING;

  SELECT rating, ranked_matches INTO _wr, _wm FROM public.player_stats WHERE player_id = _winner_player_id FOR UPDATE;
  SELECT rating, ranked_matches INTO _lr, _lm FROM public.player_stats WHERE player_id = _loser_player_id FOR UPDATE;

  _expected_w := 1.0 / (1.0 + power(10.0, (_lr - _wr)::numeric / 400.0));
  IF _wm < _placement_games OR _lm < _placement_games THEN
    _k := _k_placement;
  ELSE
    _k := _k_normal;
  END IF;
  _delta := round(_k * (1.0 - _expected_w));
  IF _delta < 1 THEN _delta := 1; END IF;

  UPDATE public.player_stats
    SET rating = rating + _delta,
        ranked_matches = ranked_matches + CASE WHEN _winner_is_bot THEN 0 ELSE 1 END,
        ranked_wins = ranked_wins + CASE WHEN _winner_is_bot THEN 0 ELSE 1 END,
        updated_at = now()
  WHERE player_id = _winner_player_id;

  UPDATE public.player_stats
    SET rating = GREATEST(100, rating - _delta),
        ranked_matches = ranked_matches + CASE WHEN _loser_is_bot THEN 0 ELSE 1 END,
        ranked_losses = ranked_losses + CASE WHEN _loser_is_bot THEN 0 ELSE 1 END,
        updated_at = now()
  WHERE player_id = _loser_player_id;

  INSERT INTO public.players (id, name, auth_user_id, updated_at)
  VALUES (_winner_player_id, COALESCE(NULLIF(btrim(_winner_name), ''), 'Player'),
          CASE WHEN _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.players WHERE id = _winner_player_id AND auth_user_id = _uid) THEN _uid ELSE NULL END,
          now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.players (id, name, auth_user_id, updated_at)
  VALUES (_loser_player_id, COALESCE(NULLIF(btrim(_loser_name), ''), 'Player'),
          CASE WHEN _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.players WHERE id = _loser_player_id AND auth_user_id = _uid) THEN _uid ELSE NULL END,
          now())
  ON CONFLICT (id) DO NOTHING;

  RETURN _delta;
END;
$function$;

-- 7. Update search_players to exclude bots
CREATE OR REPLACE FUNCTION public.search_players(_q text, _limit integer DEFAULT 10)
 RETURNS TABLE(player_id uuid, name text, country text, auth_user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, country, auth_user_id
  FROM public.players
  WHERE onboarded_at IS NOT NULL
    AND auth_user_id IS NOT NULL
    AND is_bot = false
    AND (name ILIKE (btrim(_q) || '%') OR name ILIKE ('%' || btrim(_q) || '%'))
  ORDER BY (name ILIKE (btrim(_q) || '%')) DESC, name ASC
  LIMIT LEAST(GREATEST(_limit, 1), 25);
$function$;

-- 8. New SECURITY DEFINER function to pick a bot near a rating
CREATE OR REPLACE FUNCTION public.pick_ranked_bot(_rating integer)
 RETURNS TABLE(player_id uuid, name text, initial_rating integer, current_rating integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.initial_rating, ps.rating
  FROM public.players p
  JOIN public.player_stats ps ON ps.player_id = p.id
  WHERE p.is_bot = true
  ORDER BY abs(ps.rating - COALESCE(_rating, 1000)) ASC, random()
  LIMIT 1
  OFFSET floor(random() * 5)::int;
$function$;

GRANT EXECUTE ON FUNCTION public.pick_ranked_bot(integer) TO anon, authenticated;
