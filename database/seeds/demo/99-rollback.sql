-- =====================================================================
-- DEMO SEED — 99 ROLLBACK
-- =====================================================================
-- Removes every row the demo seed created, and nothing else.
--
-- Safe because every demo row's primary key lives in the reserved
-- namespace 'deadbeef-xxxx-4000-8000-xxxxxxxxxxxx'. Real rows, and the
-- reference data seeded by Liquibase changesets (achievement
-- definitions, subscription plans, regions, tournament category
-- templates, feature flags, theme palettes, platform fee rules), are
-- untouched. Nothing here goes near databasechangelog, which
-- 044-liquibase-table-lockdown revoked from every role.
--
-- Deletes run in reverse FK order inside one transaction, so a failure
-- anywhere leaves the database exactly as it was.
--
-- AFTER this file, run:
--     node scripts/demo/demo-users.mjs --purge
-- to remove the 100 auth users and their public.users rows. That order
-- matters — player_profiles references users.
-- =====================================================================

BEGIN;

-- Feed and notifications ----------------------------------------------
DELETE FROM activities              WHERE id::text LIKE 'deadbeef-%';
DELETE FROM notifications           WHERE id::text LIKE 'deadbeef-%';

-- Announcements --------------------------------------------------------
DELETE FROM club_announcement_reads WHERE id::text LIKE 'deadbeef-%';
DELETE FROM club_announcements      WHERE id::text LIKE 'deadbeef-%';

-- Player-side social ---------------------------------------------------
DELETE FROM player_achievements     WHERE id::text LIKE 'deadbeef-%';
DELETE FROM player_shoutouts        WHERE id::text LIKE 'deadbeef-%';

-- These two are keyed by player_id, not by a surrogate id, so they are
-- matched on the demo namespace in either player column.
DELETE FROM player_badge_showcase
    WHERE player_id::text LIKE 'deadbeef-%';
DELETE FROM player_default_partners
    WHERE player_id::text LIKE 'deadbeef-%'
       OR partner_id::text LIKE 'deadbeef-%';

DELETE FROM team_ups                WHERE id::text LIKE 'deadbeef-%';
DELETE FROM partner_requests        WHERE id::text LIKE 'deadbeef-%';
DELETE FROM partnerships            WHERE id::text LIKE 'deadbeef-%';
DELETE FROM player_relationships    WHERE id::text LIKE 'deadbeef-%';

-- Ratings, matches, brackets -------------------------------------------
--
-- These four tables are cleaned by RELATIONSHIP, not by the id namespace.
-- Anything you create through the app on top of the demo data — pressing
-- "Generate bracket" on a seeded tournament, recording a draw result,
-- finishing a game on a seeded court — gets a random UUID, so a namespace
-- filter alone would leave it behind and the events could not be deleted.
-- Belonging to a demo event or a demo tournament is the real test, and it
-- still cannot reach anything genuine.
DROP TABLE IF EXISTS demo_doomed_matches;
CREATE TEMP TABLE demo_doomed_matches AS
SELECT id FROM matches WHERE id::text LIKE 'deadbeef-%'
UNION
SELECT id FROM matches
 WHERE event_id IN (SELECT id FROM events WHERE id::text LIKE 'deadbeef-%')
UNION
SELECT match_id FROM bracket_matches
 WHERE match_id IS NOT NULL
   AND tournament_id IN (SELECT id FROM tournaments WHERE id::text LIKE 'deadbeef-%');

DELETE FROM rating_transactions
    WHERE id::text LIKE 'deadbeef-%'
       OR match_id IN (SELECT id FROM demo_doomed_matches);
DELETE FROM match_verifications   WHERE match_id IN (SELECT id FROM demo_doomed_matches);
DELETE FROM match_score_proposals WHERE match_id IN (SELECT id FROM demo_doomed_matches);
DELETE FROM match_scores          WHERE match_id IN (SELECT id FROM demo_doomed_matches);
DELETE FROM match_participants    WHERE match_id IN (SELECT id FROM demo_doomed_matches);

-- bracket_matches, event_courts and event_queue all reference matches, so
-- they have to go before the matches themselves.
DELETE FROM bracket_matches
    WHERE id::text LIKE 'deadbeef-%'
       OR tournament_id IN (SELECT id FROM tournaments WHERE id::text LIKE 'deadbeef-%');
DELETE FROM event_courts
    WHERE id::text LIKE 'deadbeef-%'
       OR event_id IN (SELECT id FROM events WHERE id::text LIKE 'deadbeef-%');
DELETE FROM event_queue
    WHERE id::text LIKE 'deadbeef-%'
       OR event_id IN (SELECT id FROM events WHERE id::text LIKE 'deadbeef-%');

DELETE FROM matches WHERE id IN (SELECT id FROM demo_doomed_matches);
DROP TABLE IF EXISTS demo_doomed_matches;

-- Tournaments and events -----------------------------------------------
DELETE FROM tournament_registrations
    WHERE id::text LIKE 'deadbeef-%'
       OR tournament_id IN (SELECT id FROM tournaments WHERE id::text LIKE 'deadbeef-%');
DELETE FROM tournament_categories
    WHERE id::text LIKE 'deadbeef-%'
       OR tournament_id IN (SELECT id FROM tournaments WHERE id::text LIKE 'deadbeef-%');
DELETE FROM tournaments
    WHERE id::text LIKE 'deadbeef-%'
       OR event_id IN (SELECT id FROM events WHERE id::text LIKE 'deadbeef-%');
DELETE FROM event_registrations
    WHERE id::text LIKE 'deadbeef-%'
       OR event_id IN (SELECT id FROM events WHERE id::text LIKE 'deadbeef-%');
DELETE FROM events                   WHERE id::text LIKE 'deadbeef-%';

-- Clubs -----------------------------------------------------------------
DELETE FROM club_memberships        WHERE id::text LIKE 'deadbeef-%';
DELETE FROM clubs                   WHERE id::text LIKE 'deadbeef-%';

-- Players ---------------------------------------------------------------
DELETE FROM player_ratings          WHERE id::text LIKE 'deadbeef-%';
DELETE FROM player_profiles         WHERE id::text LIKE 'deadbeef-%';

-- Helper objects from 00-config.sql --------------------------------------
DROP VIEW IF EXISTS public.v_demo_events;
DROP VIEW IF EXISTS public.v_demo_clubs;
DROP VIEW IF EXISTS public.v_demo_players;
DROP VIEW IF EXISTS public.v_demo_clusters;
DROP FUNCTION IF EXISTS public.fn_demo_link_players();
DROP FUNCTION IF EXISTS public.fn_demo_link_player();
DROP FUNCTION IF EXISTS public.fn_demo_id(text);

COMMIT;

-- Verification: every count below must be 0.
SELECT 'demo rollback' AS step,
       (SELECT count(*) FROM player_profiles         WHERE id::text LIKE 'deadbeef-%') AS profiles,
       (SELECT count(*) FROM player_ratings          WHERE id::text LIKE 'deadbeef-%') AS ratings,
       (SELECT count(*) FROM clubs                   WHERE id::text LIKE 'deadbeef-%') AS clubs,
       (SELECT count(*) FROM club_memberships        WHERE id::text LIKE 'deadbeef-%') AS memberships,
       (SELECT count(*) FROM club_announcements      WHERE id::text LIKE 'deadbeef-%') AS announcements,
       (SELECT count(*) FROM events                  WHERE id::text LIKE 'deadbeef-%') AS events,
       (SELECT count(*) FROM event_registrations     WHERE id::text LIKE 'deadbeef-%') AS registrations,
       (SELECT count(*) FROM tournaments             WHERE id::text LIKE 'deadbeef-%') AS tournaments,
       (SELECT count(*) FROM tournament_categories   WHERE id::text LIKE 'deadbeef-%') AS categories,
       (SELECT count(*) FROM tournament_registrations WHERE id::text LIKE 'deadbeef-%') AS tournament_regs,
       (SELECT count(*) FROM bracket_matches         WHERE id::text LIKE 'deadbeef-%') AS bracket_slots,
       (SELECT count(*) FROM event_courts            WHERE id::text LIKE 'deadbeef-%') AS courts,
       (SELECT count(*) FROM event_queue             WHERE id::text LIKE 'deadbeef-%') AS queue_entries,
       (SELECT count(*) FROM matches                 WHERE id::text LIKE 'deadbeef-%') AS matches,
       (SELECT count(*) FROM match_participants      WHERE id::text LIKE 'deadbeef-%') AS participants,
       (SELECT count(*) FROM match_scores            WHERE id::text LIKE 'deadbeef-%') AS scores,
       (SELECT count(*) FROM rating_transactions     WHERE id::text LIKE 'deadbeef-%') AS rating_txns,
       (SELECT count(*) FROM activities              WHERE id::text LIKE 'deadbeef-%') AS activities,
       (SELECT count(*) FROM notifications           WHERE id::text LIKE 'deadbeef-%') AS notifications;
