-- =====================================================================
-- DEMO SEED — 01 PLAYERS
-- =====================================================================
-- 100 player profiles + ratings, achievements, shout-outs, follows,
-- partnerships, partner requests and team-ups.
--
-- Requires: 00-config.sql, and `node scripts/demo/demo-users.mjs --seed`
-- (this file resolves users.id by the reserved demo email domain).
--
-- Ratings are seeded with a base value here and RECOMPUTED in
-- 04-matches.sql from the matches actually generated, so matches_played
-- and rating_value never contradict each other.
-- =====================================================================

BEGIN;

-- Fail loudly rather than silently inserting nothing.
DO $$
DECLARE existing int;
BEGIN
    SELECT count(*) INTO existing
    FROM users u
    JOIN public.v_demo_players p ON lower(u.email) = p.email;

    IF existing < 100 THEN
        RAISE EXCEPTION
            'Only % of 100 demo users exist. Run: node scripts/demo/demo-users.mjs --seed',
            existing;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Profiles
--
-- profile_visibility MUST be 'public': player_profiles_select_public
-- gates the RLS read, /rankings filters on it, /players/:id/stats returns
-- 403 without it, and the feed's name lookup renders "Unknown" for a
-- profile it cannot see.
-- ---------------------------------------------------------------------
INSERT INTO player_profiles (
    id, user_id, display_name, first_name, last_name, bio,
    province, city, barangay, dominant_hand, preferred_position,
    profile_visibility, created_at, updated_at
)
SELECT
    p.player_id,
    u.id,
    '[DEMO] ' || nm.first_name || ' ' || nm.last_name,
    nm.first_name,
    nm.last_name,
    (ARRAY[
        'Weekend warrior. Doubles over singles, always.',
        'Former tennis player, converted and never looked back.',
        'Here for the dinks and the merienda after.',
        'Competitive but friendly. Looking for regular hitting partners.',
        'Coaching available — message me.',
        'Still learning. Patient partners appreciated!',
        'Open play regular. Rain or shine.',
        'Tournament grinder. Third-shot drop enthusiast.'
    ])[1 + (p.n % 8)],
    cl.province,
    cl.city,
    cl.barangay,
    CASE WHEN p.n % 7 = 0 THEN 'left' ELSE 'right' END,
    (ARRAY['forehand', 'backhand', 'both'])[1 + (p.n % 3)],
    'public',
    now() - (180 - (p.n % 180)) * interval '1 day',
    now() - (p.n % 14) * interval '1 day'
FROM public.v_demo_players p
JOIN public.v_demo_clusters cl ON cl.cluster = p.cluster
JOIN users u ON lower(u.email) = p.email
CROSS JOIN LATERAL (
    SELECT
        (ARRAY['Juan','Maria','Carlos','Ana','Miguel','Sofia','David','Isabella','Gabriel','Luna'])[1 + ((p.n - 1) % 10)]  AS first_name,
        (ARRAY['Santos','Reyes','Cruz','Garcia','Torres','Ramos','Mendoza','Aquino','Bautista','Villanueva'])[1 + ((p.n - 1) / 10)] AS last_name
) nm
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Ratings — singles and doubles for every player
--
-- rating_value is numeric(5,3), CHECK 2.000..8.000. `provisional` is
-- GENERATED ALWAYS AS (matches_played < 5) STORED — never insert it.
-- There are no wins/losses columns.
--
-- The distribution is bell-shaped around ~4.4 (mean of two pseudo-random
-- draws) so the rankings podium and the rating bands look plausible.
-- matches_played starts at 0 and is recomputed in 04-matches.sql.
-- ---------------------------------------------------------------------
INSERT INTO player_ratings (
    id, player_id, rating_type, rating_value, confidence_score,
    matches_played, calculated_at, created_at, updated_at
)
SELECT
    public.fn_demo_id('rating:' || p.n || ':' || rt.rating_type),
    p.player_id,
    rt.rating_type,
    LEAST(8.000, GREATEST(2.000, round(
        2.2
        + ((((p.n * 37) % 45) + ((p.n * 53) % 45))::numeric / 2 / 10)
        + CASE WHEN rt.rating_type = 'doubles'
               THEN (((p.n * 17) % 7)::numeric - 3) / 10
               ELSE 0 END
    , 3))),
    round(0.600 + (((p.n * 29) % 40)::numeric / 100), 3),
    0,
    now() - (p.n % 5) * interval '1 day',
    now() - (180 - (p.n % 180)) * interval '1 day',
    now()
FROM public.v_demo_players p
CROSS JOIN (VALUES ('singles'), ('doubles')) AS rt(rating_type)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Achievements
--
-- achievement_definitions already holds 21 rows seeded by
-- 011-achievement (changesets 0006 + 0007). Reference them by key —
-- never insert new definitions.
-- ---------------------------------------------------------------------
INSERT INTO player_achievements (id, player_id, achievement_id, unlocked_at, created_at)
SELECT
    public.fn_demo_id('ach:' || p.n || ':' || ad.key),
    p.player_id,
    ad.id,
    now() - (p.n % 90) * interval '1 day',
    now() - (p.n % 90) * interval '1 day'
FROM public.v_demo_players p
JOIN achievement_definitions ad ON (
       (ad.key IN ('first_match', 'rated_player', 'community_member') AND p.n <= 94)
    OR (ad.key IN ('first_victory', 'regular_player')                 AND p.n % 2 = 0)
    OR (ad.key IN ('winner', 'rising_star')                           AND p.n % 3 = 0)
    OR (ad.key IN ('skilled_player', 'tournament_debut')              AND p.n % 5 = 0)
    OR (ad.key IN ('social_butterfly', 'competitor')                  AND p.n % 7 = 0)
    OR (ad.key IN ('champion', 'elite_player', 'tournament_winner')   AND p.n % 11 = 0)
    OR (ad.key IN ('club_founder')                                    AND p.n % 17 = 0)
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Shout-outs
--
-- idx_shoutouts_single_active is a partial UNIQUE on (player_id) WHERE
-- is_active — at most one active shout-out per player. expires_at must be
-- in the future or the hourly fn_sweep_expired_shoutouts() pg_cron job
-- deactivates and then deletes them. message is varchar(280).
-- 03-events.sql links some of these to an event afterwards.
-- ---------------------------------------------------------------------
INSERT INTO player_shoutouts (id, player_id, message, is_active, created_at, updated_at, expires_at)
SELECT
    public.fn_demo_id('shout:' || p.n),
    p.player_id,
    (ARRAY[
        'Looking for a doubles partner this weekend — DM me!',
        'Free coaching session for beginners, message me for details.',
        'Anyone up for early morning drills? 6am, bring water.',
        'Need one more for mixed doubles. 3.5+ preferred.',
        'Selling a barely-used paddle, message if interested.',
        'New to the city and looking for a regular group!'
    ])[1 + (p.n % 6)],
    true,
    now() - (p.n % 6) * interval '1 day',
    now() - (p.n % 6) * interval '1 day',
    now() + (14 + (p.n % 20)) * interval '1 day'
FROM public.v_demo_players p
WHERE p.n % 4 = 1
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Follows
-- CHECK from_player_id != to_player_id; UNIQUE (from, to, type).
-- ---------------------------------------------------------------------
INSERT INTO player_relationships (
    id, from_player_id, to_player_id, relationship_type, status, created_at, updated_at
)
SELECT
    public.fn_demo_id('rel:' || p.n || ':' || k),
    p.player_id,
    q.player_id,
    'follow',
    'active',
    now() - ((p.n + k) % 120) * interval '1 day',
    now()
FROM public.v_demo_players p
CROSS JOIN generate_series(1, 5) AS k
JOIN public.v_demo_players q ON q.n = 1 + (((p.n * 7) + (k * 13)) % 100)
WHERE q.n <> p.n
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Partnerships
-- CHECK player1_id < player2_id (UUID ordering) — hence LEAST/GREATEST.
-- ---------------------------------------------------------------------
INSERT INTO partnerships (id, player1_id, player2_id, created_at)
SELECT
    public.fn_demo_id('pship:' || a.n),
    LEAST(a.player_id, b.player_id),
    GREATEST(a.player_id, b.player_id),
    now() - (a.n % 100) * interval '1 day'
FROM public.v_demo_players a
JOIN public.v_demo_players b ON b.n = a.n + 1
WHERE a.n % 2 = 1 AND a.n <= 93
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. Partner requests (pending, both directions)
-- CHECK from_player_id != to_player_id.
-- ---------------------------------------------------------------------
INSERT INTO partner_requests (id, from_player_id, to_player_id, status, message, created_at)
SELECT
    public.fn_demo_id('preq:' || a.n),
    a.player_id,
    b.player_id,
    'pending',
    (ARRAY[
        'Want to team up for the next tournament?',
        'Saw you play last week — interested in doubles?',
        'Looking for a steady partner, you free Saturdays?'
    ])[1 + (a.n % 3)],
    now() - (a.n % 10) * interval '1 day'
FROM public.v_demo_players a
JOIN public.v_demo_players b ON b.n = a.n + 5
WHERE a.n % 9 = 0 AND a.n + 5 <= 94
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 8. Team-ups
-- CHECK owner != member; UNIQUE (owner_player_id, member_player_id).
-- ---------------------------------------------------------------------
INSERT INTO team_ups (id, owner_player_id, member_player_id, status, message, responded_at, created_at)
SELECT
    public.fn_demo_id('teamup:' || a.n),
    a.player_id,
    b.player_id,
    CASE WHEN a.n % 12 = 0 THEN 'pending' ELSE 'accepted' END,
    'Regular hitting group — join us.',
    CASE WHEN a.n % 12 = 0 THEN NULL ELSE now() - (a.n % 20) * interval '1 day' END,
    now() - (a.n % 40) * interval '1 day'
FROM public.v_demo_players a
JOIN public.v_demo_players b ON b.n = a.n + 2
WHERE a.n % 6 = 0 AND a.n + 2 <= 94
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 9. Default partners (demo players only — PK is player_id, so rollback
--    keys off the demo namespace in that column).
-- ---------------------------------------------------------------------
INSERT INTO player_default_partners (player_id, partner_id, updated_at)
SELECT a.player_id, b.player_id, now()
FROM public.v_demo_players a
JOIN public.v_demo_players b ON b.n = a.n + 1
WHERE a.n % 2 = 1 AND a.n <= 93
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 10. Link the real account (no-op when fn_demo_link_player() is NULL).
--     /community's Partners and Team tabs are per-signed-in-player, so
--     without this they stay empty no matter how much data exists.
-- ---------------------------------------------------------------------
INSERT INTO player_relationships (
    id, from_player_id, to_player_id, relationship_type, status, created_at, updated_at
)
SELECT
    public.fn_demo_id('rel:link:out:' || p.n),
    public.fn_demo_link_player(),
    p.player_id,
    'follow',
    'active',
    now() - (p.n % 30) * interval '1 day',
    now()
FROM public.v_demo_players p
WHERE public.fn_demo_link_player() IS NOT NULL
  AND p.n % 5 = 0
ON CONFLICT DO NOTHING;

INSERT INTO player_relationships (
    id, from_player_id, to_player_id, relationship_type, status, created_at, updated_at
)
SELECT
    public.fn_demo_id('rel:link:in:' || p.n),
    p.player_id,
    public.fn_demo_link_player(),
    'follow',
    'active',
    now() - (p.n % 30) * interval '1 day',
    now()
FROM public.v_demo_players p
WHERE public.fn_demo_link_player() IS NOT NULL
  AND p.n % 3 = 0
ON CONFLICT DO NOTHING;

INSERT INTO partnerships (id, player1_id, player2_id, created_at)
SELECT
    public.fn_demo_id('pship:link:' || p.n),
    LEAST(public.fn_demo_link_player(), p.player_id),
    GREATEST(public.fn_demo_link_player(), p.player_id),
    now() - (p.n % 60) * interval '1 day'
FROM public.v_demo_players p
WHERE public.fn_demo_link_player() IS NOT NULL
  AND p.n IN (2, 6, 14, 33, 58)
ON CONFLICT DO NOTHING;

INSERT INTO partner_requests (id, from_player_id, to_player_id, status, message, created_at)
SELECT
    public.fn_demo_id('preq:link:in:' || p.n),
    p.player_id,
    public.fn_demo_link_player(),
    'pending',
    'Partner up for the next open ranked event?',
    now() - (p.n % 7) * interval '1 day'
FROM public.v_demo_players p
WHERE public.fn_demo_link_player() IS NOT NULL
  AND p.n IN (9, 21, 47)
ON CONFLICT DO NOTHING;

INSERT INTO team_ups (id, owner_player_id, member_player_id, status, message, responded_at, created_at)
SELECT
    public.fn_demo_id('teamup:link:' || p.n),
    public.fn_demo_link_player(),
    p.player_id,
    'accepted',
    'My regular crew.',
    now() - (p.n % 15) * interval '1 day',
    now() - (p.n % 45) * interval '1 day'
FROM public.v_demo_players p
WHERE public.fn_demo_link_player() IS NOT NULL
  AND p.n IN (3, 11, 26, 40, 61, 77)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'demo 01-players' AS step,
       (SELECT count(*) FROM player_profiles      WHERE id::text LIKE 'deadbeef-%') AS profiles,
       (SELECT count(*) FROM player_ratings       WHERE id::text LIKE 'deadbeef-%') AS ratings,
       (SELECT count(*) FROM player_achievements  WHERE id::text LIKE 'deadbeef-%') AS achievements,
       (SELECT count(*) FROM player_shoutouts     WHERE id::text LIKE 'deadbeef-%') AS shoutouts,
       (SELECT count(*) FROM player_relationships WHERE id::text LIKE 'deadbeef-%') AS follows,
       (SELECT count(*) FROM partnerships         WHERE id::text LIKE 'deadbeef-%') AS partnerships,
       (SELECT count(*) FROM team_ups             WHERE id::text LIKE 'deadbeef-%') AS team_ups;
