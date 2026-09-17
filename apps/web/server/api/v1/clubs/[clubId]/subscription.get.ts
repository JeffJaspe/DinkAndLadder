import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { ClubSubscriptionServiceError } from '~/server/domains/payment/services/club-subscription.service'
import { createClubSubscriptionServiceFor } from '~/server/utils/club-subscription-service'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * The club billing page, in one round trip: subscription, plan, entitlements,
 * usage, held events, billing mode and history.
 *
 * Rewritten for 056. The previous handler did the admin check inline and
 * returned 013's legacy `features` blob, which nothing enforces any more; the
 * entitlements here are the exact object `event.service.ts` refuses against.
 */
export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'MISSING_PARAMETER', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const service = await createClubSubscriptionServiceFor(serverSupabaseServiceRole(event))

  try {
    return await service.getForClub(profile.id, clubId)
  } catch (err) {
    if (err instanceof ClubSubscriptionServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
