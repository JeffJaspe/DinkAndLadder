import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createAuditRepository } from '~/server/domains/audit/repositories/audit.repository'
import { createAuditService } from '~/server/domains/audit/services/audit.service'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import {
  RatingServiceError,
  createRatingService
} from '~/server/domains/rating/services/rating.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { requireAal2 } from '~/server/utils/mfa'

/**
 * Puts a player back to "unrated" so they retake the Initial Skill Rating
 * questionnaire. SuperAdmin only, aal2 only (the server middleware enforces
 * that for /admin; the explicit call is documentation). Audit-logged with the
 * ratings as they were, because the rating rows themselves keep no record of
 * the value that was cleared — rating_transactions history is left intact.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')
  requireAal2(claims)

  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) throw apiError(400, 'VALIDATION_ERROR', 'Player ID is required.')

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', "Only the platform SuperAdmin can reset a player's rating.")
  }

  const ratingService = createRatingService(createRatingRepository(client))
  let previous
  try {
    previous = await ratingService.resetPlayerRatings(playerId)
  } catch (err) {
    if (err instanceof RatingServiceError) throw apiError(err.status, err.code, err.message)
    throw err
  }

  await createAuditService(createAuditRepository(client)).log({
    event_type: 'rating.admin_reset',
    actor_user_id: claims.sub,
    actor_player_id: null,
    target_type: 'player_rating',
    target_id: playerId,
    payload: {
      previous: previous.map((r) => ({
        rating_type: r.rating_type,
        rating_value: r.rating_value,
        matches_played: r.matches_played,
        confidence_score: r.confidence_score
      }))
    }
  })

  return {
    message: 'The rating was reset. The player will be asked to take the skill assessment again.'
  }
})
