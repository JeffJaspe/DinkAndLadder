-- =====================================================================
-- DEMO SEED - 00 CONFIG
-- =====================================================================
-- Creates the helper objects every other demo seed file depends on.
-- Run this FIRST, and re-run it any time you change the linked accounts.
--
-- Everything the demo seed creates lives in a reserved UUID namespace:
--
--     deadbeef-xxxx-4000-8000-xxxxxxxxxxxx
--
-- so 99-rollback.sql can delete it all with an exact `id::text LIKE
-- 'deadbeef-%'` filter, touching nothing real. Because the ids are a pure
-- function of a text key, every file is idempotent and re-runnable, and
-- later files can reference earlier rows without any lookup table.
--
-- These are data helpers, not schema, so they are deliberately NOT a
-- Liquibase changeset (same reasoning as
-- scripts/find-email-derived-display-names.mjs). 99-rollback.sql drops them.
--
-- Deliberately ASCII-only. This file gets edited by hand more than the
-- others, and PowerShell 5.1's Get-Content/Set-Content round-trip mangles
-- UTF-8 punctuation and adds a BOM.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Deterministic id in the reserved namespace.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_demo_id(k text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ('deadbeef-'
         || substr(md5(k), 1, 4) || '-4000-8000-'
         || substr(md5(k), 5, 12))::uuid
$$;

-- ---------------------------------------------------------------------
-- The real accounts the demo data is woven around.
--
-- EDIT THE EMAIL LIST BELOW. Every account listed becomes a club member,
-- an event registrant, a tournament organiser, a match opponent and the
-- other end of several partnerships and team-ups -- which matters because
-- /community, the club roster, club rankings and club matches are all
-- computed for the SIGNED-IN VIEWER and come back empty or 403 for a
-- non-member with no matches.
--
-- An email with no player_profiles row in THIS database is simply
-- skipped; an empty result means every linking step no-ops silently.
--
-- `ord` is a stable 1..n number per account, used to keep the generated
-- row ids distinct and to hand each account its own tournaments.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_demo_link_players()
RETURNS TABLE (player_id uuid, ord int)
LANGUAGE sql
STABLE
AS $$
    SELECT pp.id,
           (row_number() OVER (ORDER BY lower(u.email)))::int
    FROM player_profiles pp
    JOIN users u ON u.id = pp.user_id
    WHERE lower(u.email) = ANY (ARRAY[
        'jeffreyjoyjaspe@gmail.com',
        'ronahbiejacobjaspe@gmail.com',
        'jaspealrickwade@gmail.com'
    ])
$$;

-- ---------------------------------------------------------------------
-- Location clusters. These strings are load-bearing: fn_feed_for_player
-- (039-feed-geo-priority) scores barangay+city = 3, city+province = 2,
-- province = 1 on lower(btrim(...)) equality, and /rankings,
-- /clubs/search and /events all filter province/city by exact equality.
-- Profiles, clubs and events therefore all draw their location from here.
--
-- Cluster 10 is City of Tagbilaran because two of the linked accounts
-- live there -- that is what gives the feed's geo ranking something local
-- to promote when you are signed in as one of them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_demo_clusters AS
SELECT * FROM (VALUES
    ( 1, 'Metro Manila',   'Makati',              'Bel-Air'),
    ( 2, 'Metro Manila',   'Makati',              'Poblacion'),
    ( 3, 'Metro Manila',   'Taguig',              'Fort Bonifacio'),
    ( 4, 'Metro Manila',   'Pasig',               'Ortigas Center'),
    ( 5, 'Metro Manila',   'Quezon City',         'Diliman'),
    ( 6, 'Cebu',           'Cebu City',           'Lahug'),
    ( 7, 'Davao del Sur',  'Davao City',          'Poblacion District'),
    ( 8, 'Iloilo',         'Iloilo City',         'Mandurriao'),
    ( 9, 'Benguet',        'Baguio',              'Camp 7'),
    (10, 'Bohol',          'City of Tagbilaran',  'Cogon')
) AS t(cluster, province, city, barangay);

-- ---------------------------------------------------------------------
-- The 100 demo players, by index.
--
-- Cluster weighting is deliberate: Makati (clusters 1+2) holds 30 of the
-- 100 so the feed's geo ranking has something dense to rank against.
-- Cluster 10 players get no matches, which is what exercises
-- player_ratings.provisional (a GENERATED column, matches_played < 5).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_demo_players AS
SELECT
    n,
    public.fn_demo_id('player:' || n) AS player_id,
    'demo.player' || lpad(n::text, 3, '0') || '@demo.dinkandladder.test' AS email,
    CASE
        WHEN n <= 18 THEN 1
        WHEN n <= 30 THEN 2
        WHEN n <= 42 THEN 3
        WHEN n <= 52 THEN 4
        WHEN n <= 62 THEN 5
        WHEN n <= 72 THEN 6
        WHEN n <= 80 THEN 7
        WHEN n <= 87 THEN 8
        WHEN n <= 94 THEN 9
        ELSE 10
    END AS cluster
FROM generate_series(1, 100) AS n;

-- ---------------------------------------------------------------------
-- The 12 demo clubs, by index. Clubs 1..9 map onto clusters 1..9;
-- clubs 10..12 double up on clusters 1..3 so a few cities have more than
-- one club to choose between.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_demo_clubs AS
SELECT
    c AS n,
    public.fn_demo_id('club:' || c) AS club_id,
    1 + ((c - 1) % 9) AS cluster,
    -- owner is the 1st player of the cluster for clubs 1..9, the 2nd for 10..12
    1 + ((c - 1) / 9) AS owner_rank
FROM generate_series(1, 12) AS c;

-- ---------------------------------------------------------------------
-- The 100 demo events: 20 per event_type, all five types.
-- event_type IS the category the request asked for; the allowed values
-- come from ck_events_event_type. Note 'open_play' is NOT one of them.
--
-- Status spread per type (20 each) so every filter chip on /events
-- returns rows: 9 published, 3 active, 5 completed, 2 cancelled, 1 draft.
-- ---------------------------------------------------------------------
--
-- type_n (0..4) exists to break the clone: club_n and the start date in 03
-- were both derived from i alone, so all five event types with the same i
-- landed at the same club on the same day, and any "next few events" list
-- showed five near-identical rows. Offsetting by type_n spreads them across
-- clubs and days while leaving the i-driven status bands untouched.
CREATE OR REPLACE VIEW public.v_demo_events AS
SELECT
    t.event_type,
    t.type_n,
    i,
    public.fn_demo_id('event:' || t.event_type || ':' || i) AS event_id,
    1 + ((i - 1 + t.type_n * 5) % 12) AS club_n,
    CASE
        WHEN i <= 9  THEN 'published'
        WHEN i <= 12 THEN 'active'
        WHEN i <= 17 THEN 'completed'
        WHEN i <= 19 THEN 'cancelled'
        ELSE 'draft'
    END AS status,
    -- fill_mode drives how many registrations the event gets in 03:
    -- 0 = at capacity, 1 = 30-80% full, 2 = 1-3 registrants, 3 = empty
    CASE
        WHEN i % 4 = 1 THEN 0
        WHEN i % 4 = 2 THEN 1
        WHEN i % 4 = 3 THEN 1
        WHEN i % 8 = 0 THEN 3
        ELSE 2
    END AS fill_mode
FROM (VALUES
    ('open_casual', 0), ('open_ranked', 1), ('club_casual', 2),
    ('club_ranked', 3), ('tournament', 4)
) AS t(event_type, type_n)
CROSS JOIN generate_series(1, 20) AS i;

SELECT 'demo config installed'                       AS step,
       (SELECT count(*) FROM public.v_demo_players)  AS players,
       (SELECT count(*) FROM public.v_demo_clubs)    AS clubs,
       (SELECT count(*) FROM public.v_demo_events)   AS events,
       (SELECT count(*) FROM public.fn_demo_link_players()) AS linked_accounts;

-- Which real accounts were matched. An empty result here means every
-- linking step below will silently do nothing -- fix the email list.
SELECT lp.ord, pp.display_name, u.email
FROM public.fn_demo_link_players() lp
JOIN player_profiles pp ON pp.id = lp.player_id
JOIN users u ON u.id = pp.user_id
ORDER BY lp.ord;
