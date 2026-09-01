import type { MatchRepository } from '~/server/domains/match/repositories/match.repository'
import type { RatingRepository } from '../repositories/rating.repository'
import { applyRatingForMatch } from './apply-match-rating'
import type { RatingService } from './rating.service'

export interface RatingBackfillReport {
  /** Verified matches examined. */
  scanned: number
  /** Matches that had no rating transactions and were rated by this run. */
  rated: number
  /** Matches skipped because they were already rated. */
  already_rated: number
  /** Matches that could not be rated — almost always an unrated participant. */
  failed: number
  /** The ids in `failed`, capped, so a caller can look into them. */
  failed_match_ids: string[]
  /** True when a further page remains — call again with a higher offset. */
  has_more: boolean
  next_offset: number
}

export interface RatingBackfillService {
  run(options?: { limit?: number; offset?: number; dryRun?: boolean }): Promise<RatingBackfillReport>
}

const DEFAULT_LIMIT = 100
const MAX_FAILED_IDS = 50

/**
 * Replays verified matches through the rating engine so that matches which were
 * verified before the engine could see them still land in a player's history.
 *
 * Why this is needed: until 2026-09-01 the rating trigger lived inside the
 * match-verification endpoint, so the other path to `verified` — an organiser
 * recording a draw result through BracketService — rated nothing. Every
 * tournament match ever recorded moved no rating and wrote no transaction row.
 * Fixing the trigger fixes new results; it cannot retroactively rate the ones
 * already sitting in the table, which is what this does.
 *
 * Safe to run repeatedly. `RatingService.applyMatchResult` checks
 * `hasTransactionsForMatch` and refuses a match it has already rated, so a
 * second run over the same range rates nothing and reports it as
 * `already_rated`. That is also why this can be run in pages without holding a
 * lock: re-running an overlapping page is a no-op rather than a double count.
 *
 * Ordering matters and is not incidental. Ratings are path-dependent — each
 * match is computed against the rating a player held at the time — so the
 * repository hands matches back oldest-first and this rates them strictly in
 * sequence, never in parallel. Rating two of the same player's matches
 * concurrently would race on their rating row and produce a number that no
 * ordering of the real matches could have produced.
 */
export function createRatingBackfillService(
  matches: MatchRepository,
  ratings: RatingService,
  /**
   * Read only to tell "already rated" apart from "rated by this run" in the
   * report. `applyMatchResult` is idempotent either way, so the counts are the
   * only thing that depends on this.
   */
  ratingRepository: RatingRepository
): RatingBackfillService {
  return {
    async run(options = {}) {
      const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT)
      const offset = Math.max(0, options.offset ?? 0)
      const dryRun = options.dryRun ?? false

      const page = await matches.findVerifiedForRating(limit, offset)

      const report: RatingBackfillReport = {
        scanned: page.length,
        rated: 0,
        already_rated: 0,
        failed: 0,
        failed_match_ids: [],
        has_more: page.length === limit,
        next_offset: offset + page.length
      }

      for (const match of page) {
        if (await ratingRepository.hasTransactionsForMatch(match.id)) {
          report.already_rated++
          continue
        }

        if (dryRun) {
          report.rated++
          continue
        }

        // Sequential on purpose — see the ordering note above.
        const updates = await applyRatingForMatch(ratings, {
          id: match.id,
          match_type: match.match_type,
          played_at: match.played_at,
          participants: (match.match_participants ?? []).map((p) => ({
            player_id: p.player_id,
            team_number: p.team_number
          })),
          scores: (match.match_scores ?? []).map((s) => ({
            team1_score: s.team1_score,
            team2_score: s.team2_score
          }))
        })

        // applyRatingForMatch swallows its errors by design, so an empty result
        // is the only signal that a match could not be rated. The usual cause
        // is a participant with no seeded rating (PLAYER_UNRATED) — expected
        // until the initial-rating questionnaire exists, and worth reporting
        // rather than hiding, because those matches stay missing from history.
        if (updates.length === 0) {
          report.failed++
          if (report.failed_match_ids.length < MAX_FAILED_IDS) {
            report.failed_match_ids.push(match.id)
          }
        } else {
          report.rated++
        }
      }

      return report
    }
  }
}
