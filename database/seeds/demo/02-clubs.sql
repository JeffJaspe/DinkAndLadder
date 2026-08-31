-- =====================================================================
-- DEMO SEED — 02 CLUBS
-- =====================================================================
-- 12 clubs, their rosters and their announcements.
-- Requires: 00-config.sql, 01-players.sql.
--
-- Column traps this file exists to get right:
--   * clubs.created_by_user_id (NOT `created_by`), FK -> users
--   * clubs.slug is NOT NULL and CHECKed against ^[a-z0-9]+(-[a-z0-9]+)*$
--   * clubs.contact_email does not exist
--   * club_memberships.role is UPPERCASE (ck_club_memberships_role);
--     status is lowercase
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Clubs
--
-- visibility='public' + status='active' are required by
-- ClubRepository.search; verification_status='verified' drives the
-- "verified" filter on /clubs and the feed's verified_score tiebreak.
-- ---------------------------------------------------------------------
WITH cluster_rank AS (
    SELECT p.n, p.player_id, p.cluster, p.email,
           row_number() OVER (PARTITION BY p.cluster ORDER BY p.n) AS rk
    FROM public.v_demo_players p
)
INSERT INTO clubs (
    id, name, slug, description, province, city, barangay,
    court_name, court_address, visibility, status,
    created_by_user_id, verification_status,
    verification_requested_at, verified_at, verified_by_user_id,
    created_at, updated_at
)
SELECT
    c.club_id,
    '[DEMO] ' || (ARRAY[
        'Makati Dinkers', 'Bel-Air Paddle Club', 'Fort Bonifacio Pickleball',
        'Ortigas Rally House', 'Diliman Court Collective', 'Cebu Picklers Association',
        'Davao Dink Dynasty', 'Iloilo Pickleball Society', 'Baguio Mountain Picklers',
        'Poblacion Night Owls', 'Taguig Third Shot Club', 'Pasig Riverside Paddle'
    ])[c.n],
    (ARRAY[
        'demo-makati-dinkers', 'demo-bel-air-paddle-club', 'demo-fort-bonifacio-pickleball',
        'demo-ortigas-rally-house', 'demo-diliman-court-collective', 'demo-cebu-picklers-association',
        'demo-davao-dink-dynasty', 'demo-iloilo-pickleball-society', 'demo-baguio-mountain-picklers',
        'demo-poblacion-night-owls', 'demo-taguig-third-shot-club', 'demo-pasig-riverside-paddle'
    ])[c.n],
    (ARRAY[
        'Weeknight open play and a monthly ladder. All levels, no ego.',
        'Members-only courts with coaching on Sundays.',
        'The biggest competitive group in the city. Ranked events monthly.',
        'Casual-first club. We run beginner clinics every other Saturday.',
        'Student-friendly club with cheap court time and loaner paddles.',
        'Visayas'' longest-running pickleball community.',
        'Southern Mindanao headquarters. Competitive and recreational play.',
        'Western Visayas club. Beginners to pros, everyone gets a game.',
        'Cool mountain air, hot pickleball. Morning sessions daily.',
        'After-work sessions under the lights. Intermediate and up.',
        'Drill-focused club. Bring a partner or we''ll find you one.',
        'Riverside courts, weekend round robins, and a very active group chat.'
    ])[c.n],
    cl.province, cl.city, cl.barangay,
    (ARRAY[
        'Makati Sports Club Court 3', 'Bel-Air Covered Court', 'Track 30th BGC',
        'Ortigas Active Zone', 'UP Diliman Sunken Court', 'Cebu Coliseum Annex',
        'Davao Recreation Center', 'Iloilo Sports Complex', 'Burnham Park Courts',
        'Poblacion Rooftop Courts', 'BGC Turf Court 2', 'Pasig Riverside Courts'
    ])[c.n],
    cl.barangay || ', ' || cl.city || ', ' || cl.province,
    'public',
    'active',
    u.id,
    CASE WHEN c.n <= 8 THEN 'verified'
         WHEN c.n <= 10 THEN 'pending'
         ELSE 'unverified' END,
    CASE WHEN c.n <= 10 THEN now() - (30 + c.n) * interval '1 day' ELSE NULL END,
    CASE WHEN c.n <= 8  THEN now() - (20 + c.n) * interval '1 day' ELSE NULL END,
    CASE WHEN c.n <= 8  THEN u.id ELSE NULL END,
    now() - (200 - c.n * 7) * interval '1 day',
    now() - (c.n % 10) * interval '1 day'
FROM public.v_demo_clubs c
JOIN public.v_demo_clusters cl ON cl.cluster = c.cluster
JOIN cluster_rank o ON o.cluster = c.cluster AND o.rk = c.owner_rank
JOIN users u ON lower(u.email) = o.email
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Rosters — every player of the club's own cluster
--
-- Exactly one OWNER per club, and that OWNER is the same player recorded
-- in clubs.created_by_user_id above. A handful of 'pending' rows on club
-- 4 give the membership-requests queue something to show.
-- ---------------------------------------------------------------------
WITH cluster_rank AS (
    SELECT p.n, p.player_id, p.cluster,
           row_number() OVER (PARTITION BY p.cluster ORDER BY p.n) AS rk
    FROM public.v_demo_players p
)
INSERT INTO club_memberships (
    id, club_id, player_id, role, status, joined_at, created_at, updated_at
)
SELECT
    public.fn_demo_id('cm:' || c.n || ':' || m.n),
    c.club_id,
    m.player_id,
    CASE
        WHEN m.rk = c.owner_rank                       THEN 'OWNER'
        WHEN m.rk % 7 = 3                              THEN 'ADMIN'
        WHEN m.rk % 7 = 5                              THEN 'MODERATOR'
        ELSE 'MEMBER'
    END,
    CASE WHEN c.n = 4 AND m.rk BETWEEN 5 AND 7 THEN 'pending' ELSE 'active' END,
    now() - (150 - (m.n % 150)) * interval '1 day',
    now() - (150 - (m.n % 150)) * interval '1 day',
    now()
FROM public.v_demo_clubs c
JOIN cluster_rank m ON m.cluster = c.cluster
ON CONFLICT DO NOTHING;

-- Cross-cluster members so the bigger clubs read as regional, not local.
WITH cluster_rank AS (
    SELECT p.n, p.player_id, p.cluster,
           row_number() OVER (PARTITION BY p.cluster ORDER BY p.n) AS rk
    FROM public.v_demo_players p
)
INSERT INTO club_memberships (
    id, club_id, player_id, role, status, joined_at, created_at, updated_at
)
SELECT
    public.fn_demo_id('cm:visitor:' || c.n || ':' || m.n),
    c.club_id,
    m.player_id,
    'MEMBER',
    'active',
    now() - (m.n % 90) * interval '1 day',
    now() - (m.n % 90) * interval '1 day',
    now()
FROM public.v_demo_clubs c
JOIN cluster_rank m ON m.cluster = 1 + (c.cluster % 9) AND m.rk <= 5
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Announcements
--
-- Non-members and signed-out visitors see status='published' only, so
-- most rows are published with published_at set. One pinned per club,
-- one draft and one archived to prove the filtering works.
-- ---------------------------------------------------------------------
WITH cluster_rank AS (
    SELECT p.n, p.player_id, p.cluster,
           row_number() OVER (PARTITION BY p.cluster ORDER BY p.n) AS rk
    FROM public.v_demo_players p
)
INSERT INTO club_announcements (
    id, club_id, author_player_id, title, body,
    announcement_type, visibility, status, pinned,
    published_at, archived_at, created_at, updated_at
)
SELECT
    public.fn_demo_id('ann:' || c.n || ':' || k),
    c.club_id,
    o.player_id,
    (ARRAY[
        'Court schedule for this month',
        'New members: read this first',
        'Ladder standings updated',
        'Draft: proposed fee change',
        'Old: last season wrap-up'
    ])[k],
    (ARRAY[
        'Courts are booked Tue/Thu 6-9pm and Sat 7-11am. Reserve your slot in the group chat by Monday noon.',
        'Bring your own paddle, non-marking shoes, and water. Loaner paddles are available for your first two sessions.',
        'Standings are refreshed after every verified match. Check the rankings tab for where you sit right now.',
        'We are considering a small monthly fee to cover court rental. Nothing is decided — reply with your thoughts.',
        'Thanks to everyone who played last season. Final results and photos are archived here.'
    ])[k],
    (ARRAY['general', 'general', 'event', 'maintenance', 'urgent'])[k],
    CASE WHEN k = 4 THEN 'admins_only' ELSE 'all_members' END,
    CASE WHEN k = 4 THEN 'draft' WHEN k = 5 THEN 'archived' ELSE 'published' END,
    (k = 1),
    CASE WHEN k IN (1, 2, 3, 5) THEN now() - (k * 3 + c.n) * interval '1 day' ELSE NULL END,
    CASE WHEN k = 5 THEN now() - c.n * interval '1 day' ELSE NULL END,
    now() - (k * 3 + c.n) * interval '1 day',
    now() - (k * 3 + c.n) * interval '1 day'
FROM public.v_demo_clubs c
JOIN cluster_rank o ON o.cluster = c.cluster AND o.rk = c.owner_rank
CROSS JOIN generate_series(1, 5) AS k
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Link the real account into four clubs (no-op when unset).
--
-- This is what makes /clubs/:id look populated for YOU: the roster,
-- rankings, matches and stats endpoints all 403 for a non-member, so
-- without a membership the page just shows a join CTA.
-- ---------------------------------------------------------------------
INSERT INTO club_memberships (
    id, club_id, player_id, role, status, joined_at, created_at, updated_at
)
SELECT
    public.fn_demo_id('cm:link:' || lp.ord || ':' || c.n),
    c.club_id,
    lp.player_id,
    CASE WHEN c.n = 12 THEN 'ADMIN' ELSE 'MEMBER' END,
    'active',
    now() - (40 + c.n) * interval '1 day',
    now() - (40 + c.n) * interval '1 day',
    now()
FROM public.v_demo_clubs c
CROSS JOIN public.fn_demo_link_players() lp
WHERE c.n IN (1, 3, 5, 6, 7, 9, 12)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'demo 02-clubs' AS step,
       (SELECT count(*) FROM clubs              WHERE id::text LIKE 'deadbeef-%') AS clubs,
       (SELECT count(*) FROM club_memberships   WHERE id::text LIKE 'deadbeef-%') AS memberships,
       (SELECT count(*) FROM club_announcements WHERE id::text LIKE 'deadbeef-%') AS announcements;
