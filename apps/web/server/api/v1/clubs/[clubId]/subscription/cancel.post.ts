import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { ClubSubscriptionServiceError } from '~/server/domains/payment/services/club-subscription.service'
import { createClubSubscriptionServiceFor } from '~/server/utils/club-subscription-service'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/** Cancel at period end. Returns the refreshed billing page so the client need not refetch. */
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
    return await service.cancel(profile.id, clubId)
  } catch (err) {
    if (err instanceof ClubSubscriptionServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
