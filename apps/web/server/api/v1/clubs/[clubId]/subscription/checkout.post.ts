import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { ClubSubscriptionServiceError } from '~/server/domains/payment/services/club-subscription.service'
import type { CheckoutRequestDto } from '~/server/domains/payment/dto/club-billing.dto'
import { createClubSubscriptionServiceFor } from '~/server/utils/club-subscription-service'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * Buy a plan for a club.
 *
 * `Idempotency-Key` is read from the header so a retried request cannot
 * activate twice; when the client sends none the server mints one, which
 * still lets the gateway de-duplicate on its own reference.
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

  const body = await readBody<Partial<CheckoutRequestDto>>(event)
  if (!body?.plan_id || typeof body.plan_id !== 'string') {
    throw apiError(400, 'MISSING_PARAMETER', 'plan_id is required.')
  }
  const voucher = typeof body.voucher_code === 'string' ? body.voucher_code : null

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const idempotencyKey = getRequestHeader(event, 'idempotency-key') || crypto.randomUUID()
  const service = await createClubSubscriptionServiceFor(serverSupabaseServiceRole(event))

  try {
    return await service.startCheckout(profile.id, clubId, body.plan_id, idempotencyKey, voucher)
  } catch (err) {
    if (err instanceof ClubSubscriptionServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
