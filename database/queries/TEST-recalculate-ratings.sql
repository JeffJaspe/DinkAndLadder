-- =====================================================================
-- DEVELOPMENT DATABASE ONLY — recalculate missing ratings in SQL
-- =====================================================================
--
-- DO NOT RUN THIS AGAINST PRODUCTION. Check which project the SQL editor
-- is pointed at before you paste. It rewrites player_ratings and inserts
-- rating_transactions in bulk, and once committed there is no undo —
-- rating history is append-only by design (see 005-rating).
--
-- Nothing runs this for you. It lives in database/queries/, which the
-- DB Migrate workflow does not watch (that watches database/liquibase/**),
-- so it executes only when a person pastes it into a SQL editor.
--
-- Requested explicitly for testing. Read the rest of this header first.
--
-- WHAT IT IS
--   A line-by-line port of RatingService.applyMatchResult
--   (apps/web/server/domains/rating/services/rating.service.ts) into
--   PL/pgSQL, so the ratings that were never calculated for organiser-
--   recorded tournament matches can be filled in from the SQL editor.
--
-- WHY IT SHOULD NOT BECOME THE REAL PATH
--   It is a SECOND copy of the rating algorithm. Every constant below is
--   duplicated from the TypeScript, and nothing keeps the two in step —
--   change K_ESTABLISHED in one place and this silently computes different
--   numbers from the app. The supported repair is the button at
--   /admin/ratings, which runs the actual engine. Use this to see whether
--   the numbers look sane, then throw it away.
--
-- SAFETY
--   Wrapped in a transaction that ends in ROLLBACK. As written it changes
--   NOTHING — it computes, reports, and undoes itself. To keep the result,
--   change the last line to COMMIT. Read the summary it prints first.
--
--   It skips any match that already has rating_transactions rows, so it
--   cannot double-count, and any match involving a player with no starting
--   rating, which is the same PLAYER_UNRATED case the app reports.
--
-- ONE REAL CAVEAT, WHICH ALSO AFFECTS THE APP'S OWN BACKFILL
--   The algorithm weights a match by how long ago it was played, halving
--   its influence every 180 days. That is harmless when a match is rated
--   moments after it happens, which is what the engine was written for —
--   and it is NOT harmless when replaying a year-old match today, which
--   gets roughly a quarter of the influence it would have had at the time.
--   Both this script and the app's backfill inherit that. Whether a
--   replayed match should be weighted as of when it was PLAYED rather than
--   when it is being replayed is a real decision nobody has made yet.
--   RECENCY_AS_OF_PLAYED below lets you try it both ways.
-- =====================================================================

BEGIN;

DO $$
DECLARE
    -- ---- constants, mirrored from rating.service.ts ------------------
    RATING_ALGORITHM_VERSION  constant int     := 1;
    RATING_MIN                constant numeric := 2.0;
    RATING_MAX                constant numeric := 8.0;
    RATING_SCALE_S            constant numeric := 0.8305;
    PROVISIONAL_THRESHOLD     constant int     := 5;
    ESTABLISHED_THRESHOLD     constant int     := 20;
    K_PROVISIONAL             constant numeric := 0.25;
    K_ESTABLISHED             constant numeric := 0.05;
    CONFIDENCE_DECAY_FACTOR   constant numeric := 0.95;
    CONFIDENCE_FLOOR          constant numeric := 0.1;
    RECENCY_HALF_LIFE_DAYS    constant numeric := 180;

    -- Set true to weight each match as of the day it was PLAYED (recency
    -- weight 1.0), instead of discounting it for having sat unrated.
    RECENCY_AS_OF_PLAYED      constant boolean := false;

    m                 record;
    p                 record;
    team1_avg         numeric;
    team2_avg         numeric;
    team1_conf_total  numeric;
    team2_conf_total  numeric;
    team1_size        int;
    team2_size        int;
    expected1         numeric;
    actual1           numeric;
    total_points      int;
    age_days          numeric;
    recency           numeric;
    match_delta       numeric;
    side_delta        numeric;
    k_factor          numeric;
    weight            numeric;
    delta             numeric;
    new_rating        numeric;
    conf_after        numeric;
    unrated_player    boolean;

    n_rated           int := 0;
    n_skipped_unrated int := 0;
    n_examined        int := 0;
BEGIN
    -- Oldest first, and one at a time. Ratings are path-dependent: each
    -- match is computed against the rating a player held at that moment,
    -- so replaying them out of order produces numbers no ordering of the
    -- real matches could have produced. `id` breaks ties because several
    -- matches in one session share a played_at.
    FOR m IN
        SELECT ma.id, ma.match_type, ma.played_at
        FROM matches ma
        WHERE ma.status = 'verified'
          AND NOT EXISTS (
              SELECT 1 FROM rating_transactions t WHERE t.match_id = ma.id
          )
        ORDER BY ma.played_at ASC, ma.id ASC
    LOOP
        n_examined := n_examined + 1;

        -- Every participant must already have a rating of this type to
        -- update from. Same rule as the engine's PLAYER_UNRATED.
        SELECT EXISTS (
            SELECT 1
            FROM match_participants mp
            WHERE mp.match_id = m.id
              AND NOT EXISTS (
                  SELECT 1 FROM player_ratings pr
                  WHERE pr.player_id = mp.player_id
                    AND pr.rating_type = m.match_type
                    AND pr.rating_value IS NOT NULL
              )
        ) INTO unrated_player;

        IF unrated_player THEN
            n_skipped_unrated := n_skipped_unrated + 1;
            CONTINUE;
        END IF;

        -- Team averages and confidence totals.
        SELECT avg(pr.rating_value), sum(pr.confidence_score), count(*)
          INTO team1_avg, team1_conf_total, team1_size
        FROM match_participants mp
        JOIN player_ratings pr
          ON pr.player_id = mp.player_id AND pr.rating_type = m.match_type
        WHERE mp.match_id = m.id AND mp.team_number = 1;

        SELECT avg(pr.rating_value), sum(pr.confidence_score), count(*)
          INTO team2_avg, team2_conf_total, team2_size
        FROM match_participants mp
        JOIN player_ratings pr
          ON pr.player_id = mp.player_id AND pr.rating_type = m.match_type
        WHERE mp.match_id = m.id AND mp.team_number = 2;

        CONTINUE WHEN team1_size = 0 OR team2_size = 0;

        -- Expected share of the points, as a logistic of the rating gap.
        expected1 := 1 / (1 + power(10, (team2_avg - team1_avg) / RATING_SCALE_S));

        -- Actual share. A 0-0 match is treated as an even 50/50 rather
        -- than dividing by zero — same rule as actualShare().
        SELECT coalesce(sum(ms.team1_score), 0) + coalesce(sum(ms.team2_score), 0),
               CASE
                   WHEN coalesce(sum(ms.team1_score), 0) + coalesce(sum(ms.team2_score), 0) > 0
                   THEN coalesce(sum(ms.team1_score), 0)::numeric
                        / (coalesce(sum(ms.team1_score), 0) + coalesce(sum(ms.team2_score), 0))
                   ELSE 0.5
               END
          INTO total_points, actual1
        FROM match_scores ms
        WHERE ms.match_id = m.id;

        age_days := GREATEST(EXTRACT(EPOCH FROM (now() - m.played_at)) / 86400.0, 0);
        recency := CASE
                       WHEN RECENCY_AS_OF_PLAYED THEN 1.0
                       ELSE exp(-ln(2) / RECENCY_HALF_LIFE_DAYS * age_days)
                   END;

        -- resolveMatchTypeWeight() is a constant 1.0 in the engine today.
        match_delta := 1.0 * recency * (actual1 - expected1);

        -- Distribute across both sides, weighted by each player's
        -- confidence relative to their teammates'.
        FOR p IN
            SELECT mp.player_id, mp.team_number,
                   pr.rating_value, pr.confidence_score, pr.matches_played
            FROM match_participants mp
            JOIN player_ratings pr
              ON pr.player_id = mp.player_id AND pr.rating_type = m.match_type
            WHERE mp.match_id = m.id
        LOOP
            side_delta := CASE WHEN p.team_number = 1 THEN match_delta ELSE -match_delta END;

            k_factor := CASE
                WHEN p.matches_played < PROVISIONAL_THRESHOLD THEN K_PROVISIONAL
                WHEN p.matches_played >= ESTABLISHED_THRESHOLD THEN K_ESTABLISHED
                ELSE K_PROVISIONAL - (K_PROVISIONAL - K_ESTABLISHED)
                     * ((p.matches_played - PROVISIONAL_THRESHOLD)::numeric
                        / (ESTABLISHED_THRESHOLD - PROVISIONAL_THRESHOLD))
            END;

            weight := p.confidence_score / CASE WHEN p.team_number = 1
                                                THEN team1_conf_total ELSE team2_conf_total END;

            delta := (CASE WHEN p.team_number = 1 THEN team1_size ELSE team2_size END)
                     * k_factor * weight * side_delta;

            new_rating := LEAST(GREATEST(p.rating_value + delta, RATING_MIN), RATING_MAX);
            conf_after := GREATEST(p.confidence_score * CONFIDENCE_DECAY_FACTOR, CONFIDENCE_FLOOR);

            INSERT INTO rating_transactions (
                player_id, rating_type, match_id, old_rating, new_rating,
                rating_delta, confidence_before, confidence_after, calculation_version
            ) VALUES (
                p.player_id, m.match_type, m.id, p.rating_value, new_rating,
                -- Recomputed from the clamped value, not from `delta`: a
                -- player at the ceiling moves less than the raw delta says.
                new_rating - p.rating_value,
                p.confidence_score, conf_after, RATING_ALGORITHM_VERSION
            );

            UPDATE player_ratings
               SET rating_value     = new_rating,
                   confidence_score = conf_after,
                   matches_played   = p.matches_played + 1,
                   calculated_at    = now()
             WHERE player_id = p.player_id AND rating_type = m.match_type;
        END LOOP;

        n_rated := n_rated + 1;
    END LOOP;

    RAISE NOTICE '---------------------------------------------';
    RAISE NOTICE 'Matches examined     : %', n_examined;
    RAISE NOTICE 'Matches rated        : %', n_rated;
    RAISE NOTICE 'Skipped (no rating)  : %', n_skipped_unrated;
    RAISE NOTICE 'Recency as of played : %', RECENCY_AS_OF_PLAYED;
    RAISE NOTICE '---------------------------------------------';
END $$;

-- What changed, before deciding whether to keep it.
SELECT pp.display_name,
       rt.rating_type,
       count(*)                        AS matches_applied,
       round(min(rt.old_rating), 3)    AS first_old_rating,
       round(max(rt.new_rating), 3)    AS latest_new_rating,
       round(sum(rt.rating_delta), 3)  AS total_change
FROM rating_transactions rt
JOIN player_profiles pp ON pp.id = rt.player_id
GROUP BY pp.display_name, rt.rating_type
ORDER BY abs(sum(rt.rating_delta)) DESC
LIMIT 25;

-- =====================================================================
-- NOTHING ABOVE HAS BEEN SAVED.
--
-- This script computes every rating change, prints the summary and the
-- table above, and then throws it all away. Run it, read the numbers,
-- and decide.
--
--   To KEEP the changes: change the single word below to  COMMIT;
--   To keep discarding:  leave it as                      ROLLBACK;
--
-- There is no undo after COMMIT. rating_transactions is append-only by
-- design (see 005-rating), so a wrong result cannot be reversed — only
-- corrected by hand, one row at a time.
-- =====================================================================
ROLLBACK;
