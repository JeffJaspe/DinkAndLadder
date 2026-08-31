-- =====================================================================
-- DEMO SEED — 04 MATCHES
-- =====================================================================
-- ~600 matches under the completed and active events, with the full
-- chain every stats/ranking/leaderboard surface reads:
--
--   matches -> match_participants -> match_scores -> match_verifications
--           -> rating_transactions -> player_ratings
--
-- Requires: 00-config.sql, 01-players.sql, 02-clubs.sql, 03-events.sql.
--
-- Only status='verified' matches count in get_player_match_stats,
-- /events/:id/rankings, /clubs/:id/matches and the public stats counters.
-- A match with no match_scores rows is silently SKIPPED by the event
-- leaderboard, so every match here gets its sets.
--
-- This file is also where player_ratings.matches_played and rating_value
-- are recomputed, so they agree with the matches that actually exist.
-- Real (non-demo) player_ratings rows are never touched.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- The plan: one row per (match, player slot). Held in a temp table so
-- the six inserts below all draw from exactly the same lineup.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS demo_match_plan;
CREATE TEMP TABLE demo_match_plan AS
WITH ev AS (
    SELECT e.id AS event_id, e.club_id, e.match_format, e.venue,
           e.start_date, v.event_type, v.i, v.status
    FROM events e
    JOIN public.v_demo_events v ON v.event_id = e.id
    WHERE v.status IN ('completed', 'active')
),
roster AS (
    SELECT cm.club_id, cm.player_id,
           row_number() OVER (PARTITION BY cm.club_id ORDER BY cm.player_id) AS rk,
           count(*)     OVER (PARTITION BY cm.club_id)                       AS cnt
    FROM club_memberships cm
    WHERE cm.status = 'active'
      AND cm.id::text LIKE 'deadbeef-%'
),
m AS (
    SELECT
        ev.*,
        mi,
        public.fn_demo_id('match:' || ev.event_type || ':' || ev.i || ':' || mi) AS match_id,
        -- 12 of every 15 verified (~80%); the rest spread across the
        -- other statuses so the verification surfaces are not empty.
        CASE
            WHEN mi <= 12 THEN 'verified'
            WHEN mi = 13  THEN 'submitted'
            WHEN mi = 14  THEN CASE WHEN ev.i % 3 = 0 THEN 'pending_agreement' ELSE 'pending_verification' END
            ELSE               CASE WHEN ev.i % 3 = 0 THEN 'rejected' ELSE 'disputed' END
        END AS match_status,
        ev.event_type NOT IN ('open_casual', 'club_casual') AS affects_rating,
        CASE
            WHEN ev.status = 'active'
                THEN now() - (mi * 40) * interval '1 minute'
            ELSE ev.start_date::timestamptz + (7 + (mi % 6)) * interval '1 hour'
        END AS played_at,
        1 + ((ev.i + mi) % 2) AS winner_team,
        2 + ((ev.i + mi) % 2) AS n_sets
    FROM ev
    CROSS JOIN generate_series(1, 15) AS mi
)
SELECT
    m.match_id,
    m.event_id,
    m.club_id,
    m.match_format AS match_type,
    m.match_status,
    m.affects_rating,
    m.played_at,
    m.venue,
    m.winner_team,
    m.n_sets,
    j.j AS slot,
    CASE WHEN m.match_format = 'doubles'
         THEN CASE WHEN j.j < 2 THEN 1 ELSE 2 END
         ELSE j.j + 1
    END AS team_number,
    r.player_id
FROM m
CROSS JOIN generate_series(0, 3) AS j(j)
JOIN (SELECT club_id, max(cnt) AS cnt FROM roster GROUP BY club_id) sz
     ON sz.club_id = m.club_id
JOIN roster r
     ON r.club_id = m.club_id
    AND r.rk = 1 + (((m.i * 31) + (m.mi * 17) + j.j) % sz.cnt)
WHERE j.j < CASE WHEN m.match_format = 'doubles' THEN 4 ELSE 2 END;

-- A player drawn twice into the same match would break the
-- (match_id, player_id) unique constraint. The modular pick above cannot
-- collide while cnt >= 4, but assert it rather than trust it.
DO $$
DECLARE dupes int;
BEGIN
    SELECT count(*) INTO dupes FROM (
        SELECT match_id, player_id FROM demo_match_plan
        GROUP BY match_id, player_id HAVING count(*) > 1
    ) d;
    IF dupes > 0 THEN
        RAISE EXCEPTION 'Match lineup drew % duplicated player slots — roster too small.', dupes;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Matches
-- ---------------------------------------------------------------------
INSERT INTO matches (
    id, event_id, match_type, status, submitted_by_player_id, venue,
    played_at, submitted_at, verified_at, affects_rating, created_at, updated_at
)
SELECT
    p.match_id,
    p.event_id,
    p.match_type,
    p.match_status,
    p.player_id,
    p.venue,
    p.played_at,
    p.played_at + interval '30 minutes',
    CASE WHEN p.match_status = 'verified' THEN p.played_at + interval '2 hours' ELSE NULL END,
    p.affects_rating,
    p.played_at,
    p.played_at + interval '2 hours'
FROM demo_match_plan p
WHERE p.slot = 0
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Participants — UNIQUE (match_id, player_id), team_number CHECK (1,2)
-- ---------------------------------------------------------------------
INSERT INTO match_participants (id, match_id, player_id, team_number, result_status, created_at)
SELECT
    public.fn_demo_id('mp:' || p.match_id || ':' || p.slot),
    p.match_id,
    p.player_id,
    p.team_number,
    CASE
        WHEN p.match_status <> 'verified' THEN 'pending'
        WHEN p.team_number = p.winner_team THEN 'won'
        ELSE 'lost'
    END,
    p.played_at
FROM demo_match_plan p
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Scores — UNIQUE (match_id, set_number), both scores CHECK >= 0.
-- The winning team takes a 2-0, or a 2-1 after dropping the middle set.
-- ---------------------------------------------------------------------
INSERT INTO match_scores (id, match_id, set_number, team1_score, team2_score, created_at)
SELECT
    public.fn_demo_id('ms:' || d.match_id || ':' || g.s),
    d.match_id,
    g.s,
    CASE WHEN sw.set_winner = 1 THEN 11 ELSE 5 + ((g.s * 2) % 5) END,
    CASE WHEN sw.set_winner = 2 THEN 11 ELSE 5 + ((g.s * 2) % 5) END,
    d.played_at
FROM (SELECT DISTINCT match_id, winner_team, n_sets, played_at FROM demo_match_plan) d
CROSS JOIN generate_series(1, 3) AS g(s)
CROSS JOIN LATERAL (
    SELECT CASE WHEN d.n_sets = 3 AND g.s = 2 THEN 3 - d.winner_team ELSE d.winner_team END AS set_winner
) sw
WHERE g.s <= d.n_sets
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Verifications — one per participant other than the submitter.
-- UNIQUE (match_id, verifier_player_id).
-- ---------------------------------------------------------------------
INSERT INTO match_verifications (
    id, match_id, verifier_player_id, status, response_note, responded_at, created_at, updated_at
)
SELECT
    public.fn_demo_id('mv:' || p.match_id || ':' || p.slot),
    p.match_id,
    p.player_id,
    CASE p.match_status
        WHEN 'verified' THEN 'confirmed'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'disputed' THEN 'disputed'
        ELSE 'pending'
    END,
    CASE WHEN p.match_status = 'disputed' THEN 'Scores do not match what I recorded.' ELSE NULL END,
    CASE WHEN p.match_status IN ('verified', 'rejected', 'disputed')
         THEN p.played_at + interval '90 minutes' ELSE NULL END,
    p.played_at + interval '30 minutes',
    p.played_at + interval '90 minutes'
FROM demo_match_plan p
WHERE p.slot > 0
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Rating transactions
--
-- Only verified, rating-affecting matches. Joined to player_ratings on
-- the demo namespace, which deliberately excludes the linked real
-- account — this file must not rewrite a real player's rating.
-- UNIQUE (match_id, player_id, rating_type).
-- ---------------------------------------------------------------------
WITH tx AS (
    SELECT
        p.player_id,
        p.match_id,
        p.match_type AS rating_type,
        p.played_at,
        pr.rating_value AS base,
        pr.confidence_score AS conf,
        (CASE WHEN p.team_number = p.winner_team THEN 1 ELSE -1 END)
            * round((0.020 + ((p.slot + p.n_sets) % 6) * 0.010)::numeric, 3) AS delta
    FROM demo_match_plan p
    JOIN player_ratings pr
         ON pr.player_id = p.player_id
        AND pr.rating_type = p.match_type
        AND pr.id::text LIKE 'deadbeef-%'
    WHERE p.match_status = 'verified'
      AND p.affects_rating
),
running AS (
    SELECT
        tx.*,
        sum(delta) OVER (
            PARTITION BY player_id, rating_type
            ORDER BY played_at, match_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum
    FROM tx
)
INSERT INTO rating_transactions (
    id, player_id, rating_type, match_id, old_rating, new_rating, rating_delta,
    confidence_before, confidence_after, calculation_version, created_at
)
SELECT
    public.fn_demo_id('rtx:' || match_id || ':' || player_id),
    player_id,
    rating_type,
    match_id,
    round(base + cum - delta, 3),
    round(base + cum, 3),
    delta,
    conf,
    conf,
    1,
    played_at + interval '2 hours'
FROM running
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Reconcile player_ratings with what was actually generated.
--
-- provisional is GENERATED (matches_played < 5) — the cluster-10 players
-- belong to no club, so they get no matches and stay provisional, which
-- is what puts the provisional badge on /rankings.
-- ---------------------------------------------------------------------
UPDATE player_ratings pr
SET matches_played = a.cnt,
    updated_at = now()
FROM (
    SELECT player_id, match_type AS rating_type, count(*) AS cnt
    FROM demo_match_plan
    WHERE match_status = 'verified'
    GROUP BY player_id, match_type
) a
WHERE pr.player_id = a.player_id
  AND pr.rating_type = a.rating_type
  AND pr.id::text LIKE 'deadbeef-%';

UPDATE player_ratings pr
SET rating_value = LEAST(8.000, GREATEST(2.000, round(pr.rating_value + a.total, 3))),
    calculated_at = a.last_at,
    updated_at = now()
FROM (
    SELECT player_id, rating_type, sum(rating_delta) AS total, max(created_at) AS last_at
    FROM rating_transactions
    WHERE id::text LIKE 'deadbeef-%'
    GROUP BY player_id, rating_type
) a
WHERE pr.player_id = a.player_id
  AND pr.rating_type = a.rating_type
  AND pr.id::text LIKE 'deadbeef-%';

-- ---------------------------------------------------------------------
-- 7. Guarantee the linked real account has verified doubles matches.
--
-- /community's Teammates and Opponents tabs are derived purely from the
-- signed-in player's own verified matches + match_participants, so
-- leaving this to the random draw is not good enough.
-- ---------------------------------------------------------------------
INSERT INTO matches (
    id, event_id, match_type, status, submitted_by_player_id, venue,
    played_at, submitted_at, verified_at, affects_rating, created_at, updated_at
)
SELECT
    public.fn_demo_id('match:link:' || lp.ord || ':' || kk.k),
    e.event_id,
    'doubles',
    CASE WHEN kk.k <= 6 THEN 'verified' ELSE 'pending_verification' END,
    lp.player_id,
    'Demo Courts',
    now() - (kk.k * 3) * interval '1 day',
    now() - (kk.k * 3) * interval '1 day' + interval '30 minutes',
    CASE WHEN kk.k <= 6 THEN now() - (kk.k * 3) * interval '1 day' + interval '2 hours' ELSE NULL END,
    false,
    now() - (kk.k * 3) * interval '1 day',
    now()
FROM generate_series(1, 8) AS kk(k)
CROSS JOIN public.fn_demo_link_players() lp
CROSS JOIN LATERAL (
    SELECT v.event_id
    FROM public.v_demo_events v
    WHERE v.event_type = 'open_casual' AND v.status = 'completed'
    ORDER BY v.i
    OFFSET (kk.k % 5) LIMIT 1
) e
ON CONFLICT DO NOTHING;

INSERT INTO match_participants (id, match_id, player_id, team_number, result_status, created_at)
SELECT
    public.fn_demo_id('mp:link:' || lp.ord || ':' || kk.k || ':' || slot.j),
    public.fn_demo_id('match:link:' || lp.ord || ':' || kk.k),
    q.player_id,
    CASE WHEN slot.j < 2 THEN 1 ELSE 2 END,
    CASE WHEN kk.k > 6 THEN 'pending'
         WHEN (CASE WHEN slot.j < 2 THEN 1 ELSE 2 END) = 1 + (kk.k % 2) THEN 'won'
         ELSE 'lost' END,
    now() - (kk.k * 3) * interval '1 day'
FROM generate_series(1, 8) AS kk(k)
CROSS JOIN generate_series(0, 3) AS slot(j)
CROSS JOIN public.fn_demo_link_players() lp
JOIN public.v_demo_players q
     ON q.n = 1 + (((kk.k * 9) + slot.j + lp.ord * 7) % 90)
WHERE slot.j > 0
ON CONFLICT DO NOTHING;

INSERT INTO match_participants (id, match_id, player_id, team_number, result_status, created_at)
SELECT
    public.fn_demo_id('mp:link:' || lp.ord || ':' || kk.k || ':0'),
    public.fn_demo_id('match:link:' || lp.ord || ':' || kk.k),
    lp.player_id,
    1,
    CASE WHEN kk.k > 6 THEN 'pending' WHEN 1 = 1 + (kk.k % 2) THEN 'won' ELSE 'lost' END,
    now() - (kk.k * 3) * interval '1 day'
FROM generate_series(1, 8) AS kk(k)
CROSS JOIN public.fn_demo_link_players() lp
ON CONFLICT DO NOTHING;

INSERT INTO match_scores (id, match_id, set_number, team1_score, team2_score, created_at)
SELECT
    public.fn_demo_id('ms:link:' || lp.ord || ':' || kk.k || ':' || g.s),
    public.fn_demo_id('match:link:' || lp.ord || ':' || kk.k),
    g.s,
    CASE WHEN 1 + (kk.k % 2) = 1 THEN 11 ELSE 6 + g.s END,
    CASE WHEN 1 + (kk.k % 2) = 2 THEN 11 ELSE 6 + g.s END,
    now() - (kk.k * 3) * interval '1 day'
FROM generate_series(1, 8) AS kk(k)
CROSS JOIN generate_series(1, 2) AS g(s)
CROSS JOIN public.fn_demo_link_players() lp
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS demo_match_plan;

COMMIT;

SELECT 'demo 04-matches' AS step,
       (SELECT count(*) FROM matches              WHERE id::text LIKE 'deadbeef-%') AS matches,
       (SELECT count(*) FROM matches              WHERE id::text LIKE 'deadbeef-%' AND status = 'verified') AS verified,
       (SELECT count(*) FROM match_participants   WHERE id::text LIKE 'deadbeef-%') AS participants,
       (SELECT count(*) FROM match_scores         WHERE id::text LIKE 'deadbeef-%') AS scores,
       (SELECT count(*) FROM match_verifications  WHERE id::text LIKE 'deadbeef-%') AS verifications,
       (SELECT count(*) FROM rating_transactions  WHERE id::text LIKE 'deadbeef-%') AS rating_txns,
       (SELECT count(*) FROM player_ratings       WHERE id::text LIKE 'deadbeef-%' AND provisional) AS provisional_ratings;
