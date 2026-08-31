-- =====================================================================
-- DEMO SEED — 03 EVENTS
-- =====================================================================
-- 100 events — 20 in EVERY category — plus registrations, tournaments,
-- tournament categories, tournament registrations, courts and queues.
-- Requires: 00-config.sql, 01-players.sql, 02-clubs.sql.
--
-- "Category" here is events.event_type, whose allowed values come from
-- ck_events_event_type: open_casual, open_ranked, club_casual,
-- club_ranked, tournament. ('open_play' is not one of them — that is one
-- of the reasons the old database/seeds/test-data.sql could never run.)
--
-- Column traps:
--   * start_date/end_date are DATE, not timestamptz — CURRENT_DATE + n,
--     never NOW() + INTERVAL
--   * chk_event_time_order: end_time > start_time on a single-day event
--   * club_id and created_by_player_id are both NOT NULL
--   * EventRepository.search always filters visibility='public', and RLS
--     events_select_public also requires status <> 'draft'
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Events
--
-- Status spread per category (see v_demo_events): 9 published, 3 active,
-- 5 completed, 2 cancelled, 1 draft — so every filter chip on /events
-- returns rows.
-- ---------------------------------------------------------------------
INSERT INTO events (
    id, club_id, name, description, venue, province, city,
    start_date, end_date, start_time, end_time,
    registration_opens, registration_closes,
    status, visibility, created_by_player_id, event_type,
    fee_amount, fee_currency, max_participants,
    queue_enabled, queue_courts, queue_mode, queue_skip_timeout_seconds,
    match_format, created_at, updated_at
)
SELECT
    v.event_id,
    c.club_id,
    '[DEMO] ' || cl.city || ' ' || CASE v.event_type
        WHEN 'open_casual' THEN 'Open Play'
        WHEN 'open_ranked' THEN 'Ranked Night'
        WHEN 'club_casual' THEN 'Club Social'
        WHEN 'club_ranked'  THEN 'Club Ladder'
        ELSE 'Championship'
    END || ' #' || v.i,
    CASE v.event_type
        WHEN 'open_casual' THEN 'Drop-in open play. All levels welcome, paddles available to borrow. No rating impact.'
        WHEN 'open_ranked' THEN 'Open to anyone. Every verified match counts towards your rating.'
        WHEN 'club_casual' THEN 'Members-only social session. Rotating doubles, no scores kept for rating.'
        WHEN 'club_ranked'  THEN 'Members-only ladder night. Results are verified and affect ratings.'
        ELSE 'Bracketed tournament with rating-banded categories. Organizer records the scores.'
    END,
    cl.barangay || ' Courts',
    cl.province,
    cl.city,
    d.start_date,
    d.start_date + CASE WHEN v.event_type = 'tournament' THEN 1 ELSE 0 END,
    d.start_time,
    d.start_time + interval '3 hours',
    (d.start_date - 21)::timestamptz,
    (d.start_date - 1)::timestamptz,
    v.status,
    CASE WHEN v.i = 8 THEN 'registered_only'
         WHEN v.i = 9 THEN 'private'
         ELSE 'public' END,
    om.player_id,
    v.event_type,
    CASE WHEN v.event_type = 'tournament' THEN 500 + (v.i % 4) * 250
         WHEN v.i % 3 = 0 THEN NULL
         ELSE 150 + (v.i % 3) * 50 END,
    'PHP',
    CASE WHEN v.fill_mode = 0 THEN (ARRAY[8, 10, 12])[1 + (v.i % 3)]
         ELSE (ARRAY[16, 24, 32, 48, 64])[1 + (v.i % 5)] END,
    v.event_type IN ('open_casual', 'club_casual'),
    2 + (v.i % 3),
    (ARRAY['first_come', 'rating_based', 'random'])[1 + (v.i % 3)],
    120,
    CASE WHEN v.i % 5 = 0 THEN 'singles' ELSE 'doubles' END,
    now() - (60 + v.i) * interval '1 day',
    now() - (v.i % 9) * interval '1 day'
FROM public.v_demo_events v
JOIN public.v_demo_clubs c ON c.n = v.club_n
JOIN public.v_demo_clusters cl ON cl.cluster = c.cluster
JOIN club_memberships om
     ON om.club_id = c.club_id AND om.role = 'OWNER' AND om.status = 'active'
CROSS JOIN LATERAL (
    SELECT
        CASE v.status
            WHEN 'published' THEN CURRENT_DATE + (3 + v.i)
            WHEN 'active'    THEN CURRENT_DATE
            -- i is 13..17 for completed, so this spreads them 2..26 days
            -- back. Keeping some inside the last week matters: the
            -- /rankings Trend column sums rating_transactions from the
            -- last 7 days only (RANKING_TREND_DAYS).
            WHEN 'completed' THEN CURRENT_DATE - (2 + (v.i - 13) * 6)
            WHEN 'cancelled' THEN CURRENT_DATE + v.i
            ELSE CURRENT_DATE + 90
        END AS start_date,
        ('06:00'::time + ((v.i % 6) * interval '2 hours'))::time AS start_time
) d
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Registrations
--
-- The listing's registered_count counts status IN ('registered',
-- 'checked_in'), so the fill_mode spread is what makes some slot bars
-- full, some partial, some nearly empty and a few untouched.
-- ---------------------------------------------------------------------
WITH ev AS (
    SELECT e.id AS event_id, e.club_id, e.max_participants,
           v.fill_mode, v.i, v.event_type, v.status
    FROM events e
    JOIN public.v_demo_events v ON v.event_id = e.id
),
roster AS (
    SELECT cm.club_id, cm.player_id,
           row_number() OVER (PARTITION BY cm.club_id ORDER BY cm.player_id) AS rk
    FROM club_memberships cm
    WHERE cm.status = 'active'
      AND cm.id::text LIKE 'deadbeef-%'
),
targets AS (
    SELECT ev.*,
           CASE ev.fill_mode
               WHEN 0 THEN ev.max_participants
               WHEN 1 THEN GREATEST(3, (ev.max_participants * 55) / 100)
               WHEN 2 THEN 2
               ELSE 0
           END AS want
    FROM ev
)
INSERT INTO event_registrations (
    id, event_id, player_id, status, registered_at, checked_in_at
)
SELECT
    public.fn_demo_id('reg:' || t.event_type || ':' || t.i || ':' || r.rk),
    t.event_id,
    r.player_id,
    CASE WHEN t.status IN ('active', 'completed') AND r.rk % 4 <> 0
         THEN 'checked_in' ELSE 'registered' END,
    now() - (20 + (r.rk % 15)) * interval '1 day',
    CASE WHEN t.status IN ('active', 'completed') AND r.rk % 4 <> 0
         THEN now() - (t.i % 10) * interval '1 day' ELSE NULL END
FROM targets t
JOIN roster r ON r.club_id = t.club_id AND r.rk <= t.want
WHERE t.want > 0
ON CONFLICT DO NOTHING;

-- Withdrawn rows. These must NOT show up in registered_count — good
-- regression bait for the slot bar.
WITH ev AS (
    SELECT e.id AS event_id, e.club_id, v.i, v.event_type
    FROM events e
    JOIN public.v_demo_events v ON v.event_id = e.id
    WHERE v.i % 3 = 1
),
roster AS (
    SELECT cm.club_id, cm.player_id,
           row_number() OVER (PARTITION BY cm.club_id ORDER BY cm.player_id DESC) AS rk
    FROM club_memberships cm
    WHERE cm.status = 'active'
      AND cm.id::text LIKE 'deadbeef-%'
)
INSERT INTO event_registrations (
    id, event_id, player_id, status, registered_at, withdrawn_at
)
SELECT
    public.fn_demo_id('reg:wd:' || ev.event_type || ':' || ev.i || ':' || r.rk),
    ev.event_id,
    r.player_id,
    'withdrawn',
    now() - 25 * interval '1 day',
    now() - 5 * interval '1 day'
FROM ev
JOIN roster r ON r.club_id = ev.club_id AND r.rk <= 2
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Tournaments — one per tournament-type event
-- match_type is NOT NULL. There is no scoring_type or match_format
-- column on tournaments. format is CHECKed by ck_tournaments_format.
-- ---------------------------------------------------------------------
INSERT INTO tournaments (
    id, event_id, name, format, match_type,
    min_rating, max_rating, max_participants, status, created_at, updated_at
)
SELECT
    public.fn_demo_id('tour:' || v.i),
    v.event_id,
    e.name || ' Main Draw',
    -- Tournaments 10..17 are the ones 06-brackets.sql draws and plays, so they
    -- are held to the two formats that file reproduces exactly. The published
    -- tournaments (1..9) carry the other three so you can generate those draws
    -- in-app with the real generator, which is the only thing that gets the
    -- losers-bracket routing and the pool→playoff seeding right.
    CASE WHEN v.i BETWEEN 10 AND 17
         THEN (ARRAY['single_elimination', 'round_robin'])[1 + (v.i % 2)]
         ELSE (ARRAY[
             'double_elimination', 'round_robin_single_elimination',
             'round_robin_double_elimination', 'single_elimination', 'round_robin'
         ])[1 + (v.i % 5)]
    END,
    CASE WHEN v.i % 5 = 0 THEN 'singles' ELSE 'doubles' END,
    NULL,
    NULL,
    32,
    CASE v.status
        WHEN 'completed' THEN 'completed'
        WHEN 'active'    THEN 'in_progress'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'draft'     THEN 'draft'
        ELSE 'open'
    END,
    now() - (60 + v.i) * interval '1 day',
    now()
FROM public.v_demo_events v
JOIN events e ON e.id = v.event_id
WHERE v.event_type = 'tournament'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Tournament categories, from the templates seeded by 018/032.
-- No description / gender_restriction / age_min / age_max / entry_fee
-- columns exist on this table.
-- ---------------------------------------------------------------------
INSERT INTO tournament_categories (
    id, tournament_id, template_id, name, category_type,
    min_rating, max_rating, max_participants, display_order, status,
    match_type, format, created_at, updated_at
)
SELECT
    public.fn_demo_id('tcat:' || v.i || ':' || tpl.name),
    t.id,
    tpl.id,
    tpl.name,
    'predefined',
    tpl.min_rating,
    tpl.max_rating,
    -- Exactly the number of entrants seeded below. generateBracket refuses a
    -- category that is not full (CATEGORY_NOT_FULL), so a capacity larger than
    -- the entry count would make every draw undrawable in the app.
    8,
    tpl.display_order,
    CASE WHEN v.status = 'completed' THEN 'completed'
         WHEN v.status = 'cancelled' THEN 'closed'
         ELSE 'open' END,
    t.match_type,
    t.format,
    now() - (60 + v.i) * interval '1 day',
    now()
FROM public.v_demo_events v
JOIN tournaments t ON t.event_id = v.event_id
JOIN tournament_category_templates tpl
     ON tpl.name IN ('Beginner', 'Intermediate', 'Advanced', 'Open')
WHERE v.event_type = 'tournament'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Tournament registrations
--
-- Eight entrants per category — a clean power of two, so the knockout
-- draws in 06-brackets.sql have no byes and every slot is filled.
--
-- trg_tournament_registrations_one_per_category (032) raises 23505 if a
-- player OR their partner already holds a non-withdrawn slot in the same
-- (tournament_id, category_id). Entrants are therefore taken from 16
-- CONSECUTIVE indices of the global player pool (`seed_base + 0..15`),
-- which guarantees each of them appears exactly once in the category, as
-- either player_id or partner_player_id and never both. Drawing from the
-- whole pool rather than the club roster is also what lets every category
-- fill to 8 — the smaller clubs have only 12 members.
-- ---------------------------------------------------------------------
WITH cat AS (
    SELECT tc.id AS category_id, tc.tournament_id, tc.name AS cat_name,
           tc.display_order, t.match_type, v.i,
           -- display_order differs per template, so the four categories of
           -- one tournament draw four disjoint slices of the pool.
           (v.i * 37 + tc.display_order * 191) AS seed_base
    FROM tournament_categories tc
    JOIN tournaments t ON t.id = tc.tournament_id
    JOIN events e ON e.id = t.event_id
    JOIN public.v_demo_events v ON v.event_id = e.id
    WHERE tc.id::text LIKE 'deadbeef-%'
      AND v.status NOT IN ('draft', 'cancelled')
)
INSERT INTO tournament_registrations (
    id, tournament_id, category_id, player_id, partner_player_id,
    status, registered_at, confirmed_at, created_at
)
SELECT
    public.fn_demo_id('treg:' || cat.i || ':' || cat.cat_name || ':' || e.s),
    cat.tournament_id,
    cat.category_id,
    a.player_id,
    CASE WHEN cat.match_type = 'doubles' THEN b.player_id ELSE NULL END,
    'confirmed',
    now() - (30 - e.s) * interval '1 day',
    now() - (25 - e.s) * interval '1 day',
    now() - (30 - e.s) * interval '1 day'
FROM cat
CROSS JOIN generate_series(0, 7) AS e(s)
JOIN public.v_demo_players a
     ON a.n = 1 + ((cat.seed_base + e.s * 2) % 94)
JOIN public.v_demo_players b
     ON b.n = 1 + ((cat.seed_base + e.s * 2 + 1) % 94)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Open-play queue and courts, for the live sessions
--
-- Shapes that matter here, because getting them wrong makes the board
-- render empty rather than error:
--
--   * ONE event_queue row is ONE SIDE of a court, not one person. The
--     courts endpoint builds a side from `[player_id, partner_id]`, so a
--     doubles session needs partner_id filled or every side shows a
--     single name.
--   * event_courts.live_score is LiveGameScore[] — a JSON ARRAY of
--     {game_number, team1_score, team2_score} — not an object. Same shape
--     as match_score_proposals.scores.
--   * A court shows who is on it via team1_queue_id / team2_queue_id, and
--     "Up next" is built from the queue rows still in status 'waiting',
--     dealt round-robin across the courts by joined_at.
--
-- Eight sides per session: sides 1-4 are on courts 1 and 2 and marked
-- 'playing', sides 5-8 are 'waiting' and fill the Up next lists.
-- ---------------------------------------------------------------------
WITH ev AS (
    SELECT e.id AS event_id, e.club_id, e.match_format, v.i, v.event_type
    FROM events e
    JOIN public.v_demo_events v ON v.event_id = e.id
    WHERE v.event_type IN ('open_casual', 'club_casual') AND v.status = 'active'
),
roster AS (
    SELECT cm.club_id, cm.player_id,
           row_number() OVER (PARTITION BY cm.club_id ORDER BY cm.player_id) AS rk
    FROM club_memberships cm
    WHERE cm.status = 'active'
      AND cm.id::text LIKE 'deadbeef-%'
)
INSERT INTO event_queue (
    id, event_id, player_id, partner_id, match_type, status, joined_at,
    matched_at, court_number
)
SELECT
    public.fn_demo_id('queue:' || ev.event_type || ':' || ev.i || ':' || s.side),
    ev.event_id,
    a.player_id,
    CASE WHEN ev.match_format = 'doubles' THEN b.player_id ELSE NULL END,
    ev.match_format,
    CASE WHEN s.side <= 4 THEN 'playing' ELSE 'waiting' END,
    now() - (90 - s.side * 7) * interval '1 minute',
    CASE WHEN s.side <= 4 THEN now() - 20 * interval '1 minute' ELSE NULL END,
    -- sides 1+2 share court 1, sides 3+4 share court 2
    CASE WHEN s.side <= 4 THEN 1 + ((s.side - 1) / 2) ELSE NULL END
FROM ev
CROSS JOIN generate_series(1, 8) AS s(side)
JOIN roster a ON a.club_id = ev.club_id AND a.rk = s.side * 2 - 1
JOIN roster b ON b.club_id = ev.club_id AND b.rk = s.side * 2
ON CONFLICT DO NOTHING;

INSERT INTO event_courts (
    id, event_id, court_number, court_name, status,
    team1_queue_id, team2_queue_id, match_started_at,
    live_score, live_score_updated_at
)
SELECT
    public.fn_demo_id('court:' || v.event_type || ':' || v.i || ':' || k.court),
    v.event_id,
    k.court,
    'Court ' || k.court,
    CASE WHEN k.court <= 2 THEN 'playing'
         WHEN k.court = 4 THEN 'maintenance'
         ELSE 'available' END,
    CASE WHEN k.court <= 2
         THEN public.fn_demo_id('queue:' || v.event_type || ':' || v.i || ':' || (k.court * 2 - 1))
         ELSE NULL END,
    CASE WHEN k.court <= 2
         THEN public.fn_demo_id('queue:' || v.event_type || ':' || v.i || ':' || (k.court * 2))
         ELSE NULL END,
    CASE WHEN k.court <= 2 THEN now() - (12 + k.court * 4) * interval '1 minute' ELSE NULL END,
    CASE WHEN k.court = 1 THEN
             ('[{"game_number": 1, "team1_score": 11, "team2_score": 7},'
           || ' {"game_number": 2, "team1_score": ' || (4 + v.i) || ', "team2_score": 9}]')::jsonb
         WHEN k.court = 2 THEN
             ('[{"game_number": 1, "team1_score": ' || (3 + v.i) || ', "team2_score": 6}]')::jsonb
         ELSE NULL END,
    CASE WHEN k.court <= 2 THEN now() - 40 * interval '1 second' ELSE NULL END
FROM public.v_demo_events v
CROSS JOIN generate_series(1, 4) AS k(court)
WHERE v.event_type IN ('open_casual', 'club_casual')
  AND v.status = 'active'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. Attach some shout-outs to an upcoming event so the feed renders the
--    event card underneath them (038-shoutout-event-link).
-- ---------------------------------------------------------------------
WITH shout AS (
    SELECT id, row_number() OVER (ORDER BY id) AS rk
    FROM player_shoutouts
    WHERE id::text LIKE 'deadbeef-%'
),
upcoming AS (
    SELECT v.event_id, row_number() OVER (ORDER BY v.i) AS rk
    FROM public.v_demo_events v
    WHERE v.event_type = 'open_ranked' AND v.status = 'published'
)
UPDATE player_shoutouts ps
SET event_id = upcoming.event_id
FROM shout
JOIN upcoming ON upcoming.rk = 1 + (shout.rk % 9)
WHERE ps.id = shout.id
  AND shout.rk % 3 = 1;

-- ---------------------------------------------------------------------
-- 8. Register the real account into events across every status
--    (no-op when fn_demo_link_player() is NULL).
-- ---------------------------------------------------------------------
INSERT INTO event_registrations (id, event_id, player_id, status, registered_at, checked_in_at)
SELECT
    public.fn_demo_id('reg:link:' || v.event_type || ':' || v.i),
    v.event_id,
    public.fn_demo_link_player(),
    CASE WHEN v.status IN ('active', 'completed') THEN 'checked_in' ELSE 'registered' END,
    now() - (15 + v.i) * interval '1 day',
    CASE WHEN v.status IN ('active', 'completed')
         THEN now() - v.i * interval '1 day' ELSE NULL END
FROM public.v_demo_events v
WHERE public.fn_demo_link_player() IS NOT NULL
  AND v.status <> 'draft'
  AND v.i % 6 = 1
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 9. Hand five published tournaments to the real account, so YOU can
--    press "Generate bracket".
--
-- assertEventOrganizer compares events.created_by_player_id to the
-- signed-in player and nothing else — being club OWNER or ADMIN is not
-- enough. Without this you would have to sign in as a demo club owner to
-- draw anything, which is a miserable way to test the generator.
--
-- These five are one of each format, and they are the ones 06-brackets.sql
-- leaves alone:
--   i=1  round_robin_single_elimination
--   i=3  single_elimination
--   i=5  double_elimination
--   i=7  round_robin_double_elimination
--   i=9  round_robin
--
-- Each already has 8 confirmed entrants against max_participants = 8, is
-- status 'open', and is unlocked — which is every gate generateBracket
-- checks.
-- ---------------------------------------------------------------------
UPDATE events e
SET created_by_player_id = public.fn_demo_link_player(),
    updated_at = now()
FROM public.v_demo_events v
WHERE v.event_id = e.id
  AND public.fn_demo_link_player() IS NOT NULL
  AND v.event_type = 'tournament'
  AND v.status = 'published'
  AND v.i IN (1, 3, 5, 7, 9);

COMMIT;

SELECT 'demo 03-events' AS step,
       (SELECT count(*) FROM events                   WHERE id::text LIKE 'deadbeef-%') AS events,
       (SELECT count(*) FROM event_registrations      WHERE id::text LIKE 'deadbeef-%') AS registrations,
       (SELECT count(*) FROM tournaments              WHERE id::text LIKE 'deadbeef-%') AS tournaments,
       (SELECT count(*) FROM tournament_categories    WHERE id::text LIKE 'deadbeef-%') AS categories,
       (SELECT count(*) FROM tournament_registrations WHERE id::text LIKE 'deadbeef-%') AS tournament_regs,
       (SELECT count(*) FROM event_courts             WHERE id::text LIKE 'deadbeef-%') AS courts,
       (SELECT count(*) FROM event_queue              WHERE id::text LIKE 'deadbeef-%') AS queue_entries;

-- Per-category proof that all five categories are populated.
SELECT event_type, status, count(*) AS events
FROM events
WHERE id::text LIKE 'deadbeef-%'
GROUP BY event_type, status
ORDER BY event_type, status;
