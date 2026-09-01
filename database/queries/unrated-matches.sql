-- How many verified matches never reached the rating engine.
--
-- READ ONLY. Nothing here writes; it exists to size the problem before the
-- backfill is run from /admin/ratings, and to confirm afterwards that it
-- actually did something.
--
-- Background: until 2026-09-01 the rating trigger lived inside the match
-- verification endpoint, so the other route to a verified match — an organiser
-- recording a draw result through BracketService — rated nothing. Every
-- tournament match ever recorded left ratings untouched and wrote no
-- rating_transactions row.
--
-- Deliberately NOT a fix. Calculating ratings in SQL would be a second
-- implementation of the algorithm sitting beside the TypeScript one, and the
-- two would drift — so repairs go through the rating service, which stamps
-- every row with RATING_ALGORITHM_VERSION and refuses to rate a match twice.

-- ---------------------------------------------------------------------------
-- 1. The headline: how many verified matches have no rating rows at all.
-- ---------------------------------------------------------------------------
SELECT
    count(*) FILTER (WHERE rt.match_id IS NULL)  AS unrated_matches,
    count(*) FILTER (WHERE rt.match_id IS NOT NULL) AS rated_matches,
    count(*)                                      AS verified_matches
FROM matches m
LEFT JOIN LATERAL (
    -- LATERAL with LIMIT 1 rather than a GROUP BY: the question is only
    -- "does any row exist", and a rated match has one row per participant.
    SELECT 1 AS match_id FROM rating_transactions t WHERE t.match_id = m.id LIMIT 1
) rt ON true
WHERE m.status = 'verified';

-- ---------------------------------------------------------------------------
-- 2. Split by event type, which is where the pattern should be obvious:
--    tournament matches should dominate the unrated column.
-- ---------------------------------------------------------------------------
SELECT
    coalesce(e.event_type, '(no event)') AS event_type,
    count(*) FILTER (WHERE rt.match_id IS NULL) AS unrated,
    count(*)                                    AS total
FROM matches m
LEFT JOIN events e ON e.id = m.event_id
LEFT JOIN LATERAL (
    SELECT 1 AS match_id FROM rating_transactions t WHERE t.match_id = m.id LIMIT 1
) rt ON true
WHERE m.status = 'verified'
GROUP BY 1
ORDER BY unrated DESC;

-- ---------------------------------------------------------------------------
-- 3. Which players are most affected — the accounts whose rating history has
--    holes in it. Useful for picking one to spot-check after the backfill.
-- ---------------------------------------------------------------------------
SELECT
    pp.display_name,
    count(*) AS unrated_matches,
    min(m.played_at)::date AS earliest,
    max(m.played_at)::date AS latest
FROM matches m
JOIN match_participants mp ON mp.match_id = m.id
JOIN player_profiles pp ON pp.id = mp.player_id
WHERE m.status = 'verified'
  AND NOT EXISTS (SELECT 1 FROM rating_transactions t WHERE t.match_id = m.id)
GROUP BY pp.display_name
ORDER BY unrated_matches DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 4. How many of those cannot be rated yet anyway.
--
--    A match involving a player with no seeded rating fails with
--    PLAYER_UNRATED — a known gap until the initial-rating questionnaire
--    (ADR-001) exists. This is the number the backfill will report as
--    "could not rate", so seeing it here first stops that looking like a bug.
-- ---------------------------------------------------------------------------
SELECT count(*) AS unrated_and_unratable
FROM matches m
WHERE m.status = 'verified'
  AND NOT EXISTS (SELECT 1 FROM rating_transactions t WHERE t.match_id = m.id)
  AND EXISTS (
      SELECT 1
      FROM match_participants mp
      WHERE mp.match_id = m.id
        AND NOT EXISTS (
            SELECT 1
            FROM player_ratings pr
            WHERE pr.player_id = mp.player_id
              AND pr.rating_type = m.match_type
        )
  );
