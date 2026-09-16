import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchDto } from '~/server/domains/match/dto/match.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { applyRatingForMatch } from '~/server/domains/rating/services/apply-match-rating'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import type { NotificationType } from '~/server/domains/notification/dto/notification.dto'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createActivityLogger } from '~/server/domains/activity/services/activity.service'
import { awardAchievementsForPlayers } from '~/server/utils/award-achievements'

/**
 * Everything that follows a match becoming verified, in one place.
 *
 * Feed rows for every participant, the rating move, and a rating notification
 * per player. This used to live inline in the verification-decision endpoint,
 * which was the only way a match ever reached 'verified' from the app; now an
 * organiser's record reaches it directly (POST /api/v1/matches), and both
 * paths have to settle the result the same way or the two kinds of match
 * would drift apart in what they do to a player's number.
 *
 * Cross-domain by nature — match, rating, activity, notification — which is
 * why it sits in the API layer's utils rather than inside any one domain.
 * Best-effort after the match itself is stored: a rating failure must not
 * undo a result that is already recorded (applyRatingForMatch swallows and
 * logs its own errors for that reason).
 */
export async function settleVerifiedMatch(
  serviceClient: SupabaseClient,
  match: MatchDto
): Promise<void> {
  const activityLogger = createActivityLogger(createActivityRepository(serviceClient))
  const notificationService = createNotificationService(createNotificationRepository(serviceClient))
  const playerRepo = createPlayerProfileRepository(serviceClient)

  await Promise.all(
    match.participants.map((p) =>
      activityLogger.logMatchVerified(p.player_id, match.id, {
        match_type: match.match_type,
        opponent_ids: match.participants
          .filter((o) => o.team_number !== p.team_number)
          .map((o) => o.player_id)
      })
    )
  )

  const ratingUpdates = await applyRatingForMatch(
    createRatingService(createRatingRepository(serviceClient)),
    match
  )

  for (const update of ratingUpdates) {
    await activityLogger.logRatingChanged(
      update.player_id,
      match.match_type,
      update.old_rating,
      update.new_rating
    )

    const profile = await playerRepo.findById(update.player_id)
    if (profile) {
      const direction = update.rating_delta > 0 ? 'increased' : 'decreased'
      await notificationService.notify({
        user_id: profile.user_id,
        type: 'rating.updated' as NotificationType,
        title: 'Rating Updated',
        body: `Your ${match.match_type} rating ${direction} from ${update.old_rating.toFixed(2)} to ${update.new_rating.toFixed(2)}.`,
        reference_type: 'player_rating',
        reference_id: update.player_id
      })
    }
  }

  /**
   * A settled match is the richest achievement trigger in the product: it can
   * move a player across the match-count, win-count and rating milestones in
   * one go, for up to four people at once.
   *
   * Last, and after the rating has been applied, so the rating milestones are
   * decided on the new number rather than the old one. Every participant is
   * re-evaluated rather than only the winners — matches played is a milestone
   * too, and 'first_match' belongs to whoever lost it just as much.
   */
  const participantProfiles = await playerRepo.findByIds(
    match.participants.map((p) => p.player_id)
  )
  await awardAchievementsForPlayers(
    serviceClient,
    participantProfiles.map((profile) => ({ playerId: profile.id, userId: profile.user_id }))
  )
}
