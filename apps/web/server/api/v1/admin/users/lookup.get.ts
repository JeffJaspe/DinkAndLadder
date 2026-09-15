import { serverSupabaseServiceRole } from '#supabase/server'
import { getQuery } from 'h3'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createUserRepository } from '~/server/domains/identity/repositories/user.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Finds one account by email for the SuperAdmin consoles. Returns only what
 * the admin actions need to show: id, address, whether 2FA is on, and — when
 * the account has a player profile — the player's id, name and current
 * ratings (for the rating reset on /admin/ratings). SuperAdmin only (and, via
 * the server middleware, aal2 only).
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')

  const email = getQuery(event).email
  if (typeof email !== 'string' || !email.trim()) {
    throw apiError(400, 'VALIDATION_ERROR', 'email is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can look up accounts.')
  }

  const user = await createUserRepository(client).findByEmail(email)
  if (!user) throw apiError(404, 'NOT_FOUND', 'No account has that email address.')

  const profile = await createPlayerProfileRepository(client).findByUserId(user.id)
  let player: {
    id: string
    display_name: string
    singles_rating: number | null
    doubles_rating: number | null
    matches_played: number
  } | null = null
  if (profile) {
    const ratingService = createRatingService(createRatingRepository(client))
    const [singles, doubles] = await Promise.all([
      ratingService.getRating(profile.id, 'singles'),
      ratingService.getRating(profile.id, 'doubles')
    ])
    player = {
      id: profile.id,
      display_name: profile.display_name,
      singles_rating: singles?.rating_value ?? null,
      doubles_rating: doubles?.rating_value ?? null,
      matches_played: Math.max(singles?.matches_played ?? 0, doubles?.matches_played ?? 0)
    }
  }

  return {
    data: {
      id: user.id,
      email: user.email,
      mfa_enrolled_at: user.mfa_enrolled_at,
      is_self: user.id === claims.sub,
      player
    }
  }
})
