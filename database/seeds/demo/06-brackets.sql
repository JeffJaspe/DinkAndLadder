-- =====================================================================
-- DEMO SEED — 06 BRACKETS
-- =====================================================================
-- Draws and plays the tournament brackets, so the Matchups / bracket tree
-- and the round-robin standings have something real in them.
-- Requires: 00-config.sql, 01..05.
--
-- SCOPE, and why it is what it is
-- -------------------------------
-- Only tournaments 10..17 are drawn here, and only in the two formats
-- this file can reproduce EXACTLY as `bracket.service.ts` would emit
-- them:
--
--   * single_elimination — buildFirstRound + the empty later rounds, with
--     winners advanced by nextSlotFor(): positions 1 and 2 both feed
--     round+1 position 1, into slot 1 and slot 2 respectively.
--   * round_robin        — generateRoundRobinBracket's circle method:
--     entrant 0 fixed, the other seven rotating one place per round,
--     pairing currentOrder[k] against currentOrder[7-k].
--
-- 8 entrants per category means a power of two, so there are no byes and
-- every slot is filled.
--
-- double_elimination and the two staged (pool -> playoff) formats are
-- deliberately NOT seeded. Their losers-bracket routing and pool seeding
-- are intricate enough that a hand-written draw that is subtly wrong
-- would render as a broken bracket — worse than an empty one. Those
-- formats sit on the PUBLISHED tournaments (1..9) instead, where you can
-- press "Generate bracket" in the app and get the real generator's
-- output. That is also the honest way to test the generator.
--
-- WHAT IT PRODUCES
-- ----------------
--   * completed events (i 13..17) — every match played, a champion at the
--     top of the tree / a full standings table
--   * active events (i 10..12) — the early rounds played, one match live
--     with a running score, the rest ready or pending
--
-- Every played slot gets a real `matches` row with participants and
-- scores, exactly as BracketService.recordMatchResult would: participant1
-- becomes team 1, and the match is created already 'verified' (the
-- organiser writing down a draw result IS the verification).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- The entrants of every drawable category, in seed order (0..7).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS demo_bracket_seed;
CREATE TEMP TABLE demo_bracket_seed AS
SELECT
    tc.id                                        AS category_id,
    tc.tournament_id,
    t.event_id,
    v.i,
    v.status                                     AS event_status,
    t.format,
    coalesce(tc.match_type, t.match_type)        AS match_type,
    e.created_by_player_id                       AS organizer_player_id,
    e.start_date,
    tr.id                                        AS registration_id,
    tr.player_id,
    tr.partner_player_id,
    row_number() OVER (PARTITION BY tc.id ORDER BY tr.registered_at, tr.id) - 1 AS seed
FROM tournament_categories tc
JOIN tournaments t ON t.id = tc.tournament_id
JOIN events e ON e.id = t.event_id
JOIN public.v_demo_events v ON v.event_id = t.event_id
JOIN tournament_registrations tr
     ON tr.category_id = tc.id AND tr.status = 'confirmed'
WHERE tc.id::text LIKE 'deadbeef-%'
  AND v.i BETWEEN 10 AND 17
  AND t.format IN ('single_elimination', 'round_robin');

-- Every drawable category must have exactly the 8 entrants the knockout
-- assumes. Fail loudly rather than emit a malformed draw.
DO $$
DECLARE bad int;
BEGIN
    SELECT count(*) INTO bad FROM (
        SELECT category_id FROM demo_bracket_seed
        GROUP BY category_id HAVING count(*) <> 8
    ) d;
    IF bad > 0 THEN
        RAISE EXCEPTION
            '% categories do not have exactly 8 confirmed entrants — run 03-events.sql first.',
            bad;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- The draw: one row per bracket slot, with its two seeds and its winner
-- resolved before anything is written.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS demo_bracket_plan;
CREATE TEMP TABLE demo_bracket_plan AS
WITH cats AS (
    SELECT DISTINCT category_id, tournament_id, event_id, i, event_status,
                    format, match_type, organizer_player_id, start_date
    FROM demo_bracket_seed
),
-- --- single elimination -----------------------------------------------
-- Higher seed advances, except in one deterministic upset per draw, so
-- the tree is not a straight line down the seeding.
r1 AS (
    SELECT c.*, 1 AS round, p.pos AS position,
           (p.pos - 1) * 2       AS p1_seed,
           (p.pos - 1) * 2 + 1   AS p2_seed,
           CASE WHEN p.pos = 1 + (c.i % 4)
                THEN (p.pos - 1) * 2 + 1
                ELSE (p.pos - 1) * 2 END AS w_seed
    FROM cats c
    CROSS JOIN generate_series(1, 4) AS p(pos)
    WHERE c.format = 'single_elimination'
),
r2 AS (
    -- positions 1,2 and 3,4 collapse into positions 1 and 2 (nextSlotFor).
    SELECT a.category_id, a.tournament_id, a.event_id, a.i, a.event_status,
           a.format, a.match_type, a.organizer_player_id, a.start_date,
           2 AS round, (a.position + 1) / 2 AS position,
           a.w_seed AS p1_seed, b.w_seed AS p2_seed,
           CASE WHEN (a.i + a.position) % 2 = 0 THEN a.w_seed ELSE b.w_seed END AS w_seed
    FROM r1 a
    JOIN r1 b ON b.category_id = a.category_id AND b.position = a.position + 1
    WHERE a.position IN (1, 3)
),
r3 AS (
    SELECT a.category_id, a.tournament_id, a.event_id, a.i, a.event_status,
           a.format, a.match_type, a.organizer_player_id, a.start_date,
           3 AS round, 1 AS position,
           a.w_seed AS p1_seed, b.w_seed AS p2_seed,
           CASE WHEN a.i % 2 = 0 THEN a.w_seed ELSE b.w_seed END AS w_seed
    FROM r2 a
    JOIN r2 b ON b.category_id = a.category_id AND b.position = 2
    WHERE a.position = 1
),
elim AS (
    SELECT * FROM r1 UNION ALL SELECT * FROM r2 UNION ALL SELECT * FROM r3
),
-- --- round robin -------------------------------------------------------
-- generateRoundRobinBracket's circle method, stated arithmetically:
-- currentOrder[k] for round r is seed 0 when k = 0, and otherwise
-- seed 1 + ((k - 1) - (r - 1)) mod 7. Position p pairs k = p-1 against
-- k = 8-p.
rr AS (
    SELECT c.*, r.round, p.pos AS position,
           CASE WHEN p.pos = 1 THEN 0
                ELSE 1 + ((((p.pos - 2) - (r.round - 1)) % 7) + 7) % 7 END AS p1_seed,
           1 + ((((7 - p.pos) - (r.round - 1)) % 7) + 7) % 7 AS p2_seed,
           NULL::int AS w_seed
    FROM cats c
    CROSS JOIN generate_series(1, 7) AS r(round)
    CROSS JOIN generate_series(1, 4) AS p(pos)
    WHERE c.format = 'round_robin'
),
rr_scored AS (
    SELECT rr.category_id, rr.tournament_id, rr.event_id, rr.i, rr.event_status,
           rr.format, rr.match_type, rr.organizer_player_id, rr.start_date,
           rr.round, rr.position, rr.p1_seed, rr.p2_seed,
           CASE WHEN (rr.round + rr.position + rr.i) % 3 = 0
                THEN rr.p2_seed ELSE rr.p1_seed END AS w_seed
    FROM rr
),
all_slots AS (
    SELECT * FROM elim UNION ALL SELECT * FROM rr_scored
)
SELECT
    s.*,
    -- How far the draw has been played.
    CASE
        WHEN s.event_status = 'completed' THEN true
        WHEN s.format = 'single_elimination' THEN s.round = 1
        ELSE s.round <= 4
    END AS played,
    -- The one match being played right now, in each live draw.
    (s.event_status = 'active'
     AND s.position = 1
     AND s.round = CASE WHEN s.format = 'single_elimination' THEN 2 ELSE 5 END
    ) AS live,
    -- Whether both entrants are known yet. A round-robin fixture list is
    -- fixed at generation; a knockout round only fills as feeders finish.
    CASE
        WHEN s.format = 'round_robin' THEN true
        WHEN s.event_status = 'completed' THEN true
        ELSE s.round <= 2
    END AS entrants_known
FROM all_slots s;

-- ---------------------------------------------------------------------
-- 1. The matches behind every played slot.
--
-- participant1 is team 1 — the same mapping recordMatchResult fixes, and
-- what lets the bracket card read the sets back in its own orientation.
-- Created already 'verified': an organiser recording a draw result is the
-- verification, so these never sit in a confirmation queue.
-- ---------------------------------------------------------------------
INSERT INTO matches (
    id, event_id, match_type, status, submitted_by_player_id, venue,
    played_at, submitted_at, verified_at, affects_rating, created_at, updated_at
)
SELECT
    public.fn_demo_id('bmatch:' || p.category_id || ':' || p.round || ':' || p.position),
    p.event_id,
    p.match_type,
    'verified',
    p.organizer_player_id,
    NULL,
    d.played_at,
    d.played_at + interval '5 minutes',
    d.played_at + interval '10 minutes',
    true,
    d.played_at,
    d.played_at + interval '10 minutes'
FROM demo_bracket_plan p
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN p.event_status = 'active'
            THEN now() - (p.round * 70 + p.position * 15) * interval '1 minute'
        ELSE p.start_date::timestamptz
             + (8 + p.round) * interval '1 hour'
             + p.position * interval '25 minutes'
    END AS played_at
) d
WHERE p.played
ON CONFLICT DO NOTHING;

INSERT INTO match_participants (id, match_id, player_id, team_number, result_status, created_at)
SELECT
    public.fn_demo_id('bmp:' || p.category_id || ':' || p.round || ':' || p.position
                            || ':' || side.team || ':' || side.slot),
    public.fn_demo_id('bmatch:' || p.category_id || ':' || p.round || ':' || p.position),
    side.player_id,
    side.team,
    CASE WHEN side.team = side.winning_team THEN 'won' ELSE 'lost' END,
    now()
FROM demo_bracket_plan p
CROSS JOIN LATERAL (
    SELECT 1 AS team, 1 AS slot, e1.player_id,
           CASE WHEN p.w_seed = p.p1_seed THEN 1 ELSE 2 END AS winning_team
    FROM demo_bracket_seed e1
    WHERE e1.category_id = p.category_id AND e1.seed = p.p1_seed
    UNION ALL
    SELECT 1, 2, e1.partner_player_id,
           CASE WHEN p.w_seed = p.p1_seed THEN 1 ELSE 2 END
    FROM demo_bracket_seed e1
    WHERE e1.category_id = p.category_id AND e1.seed = p.p1_seed
      AND e1.partner_player_id IS NOT NULL
    UNION ALL
    SELECT 2, 1, e2.player_id,
           CASE WHEN p.w_seed = p.p1_seed THEN 1 ELSE 2 END
    FROM demo_bracket_seed e2
    WHERE e2.category_id = p.category_id AND e2.seed = p.p2_seed
    UNION ALL
    SELECT 2, 2, e2.partner_player_id,
           CASE WHEN p.w_seed = p.p1_seed THEN 1 ELSE 2 END
    FROM demo_bracket_seed e2
    WHERE e2.category_id = p.category_id AND e2.seed = p.p2_seed
      AND e2.partner_player_id IS NOT NULL
) side
WHERE p.played
ON CONFLICT DO NOTHING;

-- Two sets, oriented participant1-first: the winner takes 11, the loser a
-- plausible 5-9.
INSERT INTO match_scores (id, match_id, set_number, team1_score, team2_score, created_at)
SELECT
    public.fn_demo_id('bms:' || p.category_id || ':' || p.round || ':' || p.position
                            || ':' || g.s),
    public.fn_demo_id('bmatch:' || p.category_id || ':' || p.round || ':' || p.position),
    g.s,
    CASE WHEN p.w_seed = p.p1_seed THEN 11 ELSE 5 + ((p.position + g.s) % 5) END,
    CASE WHEN p.w_seed = p.p2_seed THEN 11 ELSE 5 + ((p.position + g.s) % 5) END,
    now()
FROM demo_bracket_plan p
CROSS JOIN generate_series(1, 2) AS g(s)
WHERE p.played
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. The bracket itself.
--
-- live_score is LiveBracketScore[] — the same {game_number, team1_score,
-- team2_score} shape the courts board uses. `is_live` on the DTO is
-- derived from started_at with no winner yet, which is what puts the red
-- LIVE label on the card.
-- ---------------------------------------------------------------------
INSERT INTO bracket_matches (
    id, tournament_id, category_id, round, position, match_id,
    participant1_registration_id, participant2_registration_id,
    winner_registration_id, status, scheduled_at,
    live_score, live_score_updated_at, started_at, created_at
)
SELECT
    public.fn_demo_id('bm:' || p.category_id || ':' || p.round || ':' || p.position),
    p.tournament_id,
    p.category_id,
    p.round,
    p.position,
    CASE WHEN p.played
         THEN public.fn_demo_id('bmatch:' || p.category_id || ':' || p.round || ':' || p.position)
         ELSE NULL END,
    CASE WHEN p.entrants_known THEN e1.registration_id ELSE NULL END,
    CASE WHEN p.entrants_known THEN e2.registration_id ELSE NULL END,
    CASE WHEN p.played THEN ew.registration_id ELSE NULL END,
    CASE
        WHEN p.played          THEN 'completed'
        WHEN p.live            THEN 'in_progress'
        WHEN p.entrants_known  THEN 'ready'
        ELSE 'pending'
    END,
    CASE WHEN NOT p.played
         THEN p.start_date::timestamptz + (8 + p.round) * interval '1 hour'
         ELSE NULL END,
    CASE WHEN p.live
         THEN '[{"game_number": 1, "team1_score": 9, "team2_score": 6}]'::jsonb
         ELSE NULL END,
    CASE WHEN p.live THEN now() - 25 * interval '1 second' ELSE NULL END,
    CASE WHEN p.live THEN now() - 18 * interval '1 minute' ELSE NULL END,
    now()
FROM demo_bracket_plan p
LEFT JOIN demo_bracket_seed e1
       ON e1.category_id = p.category_id AND e1.seed = p.p1_seed
LEFT JOIN demo_bracket_seed e2
       ON e2.category_id = p.category_id AND e2.seed = p.p2_seed
LEFT JOIN demo_bracket_seed ew
       ON ew.category_id = p.category_id AND ew.seed = p.w_seed
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Lock the drawn categories.
--
-- getBracket returns `rounds: []` to anyone who is not the organiser
-- while a draw is unlocked — it is their working copy until they publish
-- it. Without this the brackets above would be invisible to everybody
-- except the club owner.
-- ---------------------------------------------------------------------
UPDATE tournament_categories tc
SET bracket_locked_at = now() - interval '2 days',
    bracket_locked_by_player_id = s.organizer_player_id,
    status = CASE WHEN s.event_status = 'completed' THEN 'completed' ELSE 'open' END,
    updated_at = now()
FROM (SELECT DISTINCT category_id, organizer_player_id, event_status FROM demo_bracket_seed) s
WHERE tc.id = s.category_id;

-- ---------------------------------------------------------------------
-- 4. Re-reconcile player_ratings.matches_played.
--
-- 04-matches.sql set it from the matches that existed then; the bracket
-- results above are more verified matches for the same players, and a
-- profile whose match count disagrees with its own match list looks
-- broken. Recomputed across every demo match, so this is correct however
-- often it is re-run.
--
-- No rating_transactions are written for bracket results — which mirrors
-- the app: recordMatchResult creates and verifies the match and stops
-- there. rating_value is therefore left exactly as 04 computed it.
-- ---------------------------------------------------------------------
UPDATE player_ratings pr
SET matches_played = a.cnt,
    updated_at = now()
FROM (
    SELECT mp.player_id, m.match_type AS rating_type, count(*) AS cnt
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.status = 'verified'
      AND m.id::text LIKE 'deadbeef-%'
    GROUP BY mp.player_id, m.match_type
) a
WHERE pr.player_id = a.player_id
  AND pr.rating_type = a.rating_type
  AND pr.id::text LIKE 'deadbeef-%';

DROP TABLE IF EXISTS demo_bracket_plan;
DROP TABLE IF EXISTS demo_bracket_seed;

COMMIT;

SELECT 'demo 06-brackets' AS step,
       (SELECT count(*) FROM bracket_matches WHERE id::text LIKE 'deadbeef-%') AS bracket_slots,
       (SELECT count(*) FROM bracket_matches WHERE id::text LIKE 'deadbeef-%' AND status = 'completed') AS played,
       (SELECT count(*) FROM bracket_matches WHERE id::text LIKE 'deadbeef-%' AND status = 'in_progress') AS live_now,
       (SELECT count(*) FROM tournament_categories WHERE id::text LIKE 'deadbeef-%' AND bracket_locked_at IS NOT NULL) AS locked_draws;

-- Shape of every seeded draw, so a malformed one is obvious at a glance.
SELECT t.format,
       e.status AS event_status,
       bm.round,
       count(*) AS slots,
       count(*) FILTER (WHERE bm.status = 'completed') AS completed
FROM bracket_matches bm
JOIN tournaments t ON t.id = bm.tournament_id
JOIN events e ON e.id = t.event_id
WHERE bm.id::text LIKE 'deadbeef-%'
GROUP BY t.format, e.status, bm.round
ORDER BY t.format, e.status, bm.round;
