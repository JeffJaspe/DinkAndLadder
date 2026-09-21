import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { assertCanRunEvent } from '~/server/utils/event-organizer'
import type { RegistrationPaymentStatus } from '~/server/domains/event/dto/event.dto'

const VALID_STATUSES: RegistrationPaymentStatus[] = ['not_required', 'pending', 'paid', 'waived']

/**
 * Update the payment status of a registration.
 *
 * Only event organizers can mark a registration as paid/waived. This enables
 * manual payment tracking for free or cash-pay events where the organizer
 * collects payment at the door.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to update payment status.')
  }

  const eventId = getRouterParam(event, 'eventId')
  const registrationId = getRouterParam(event, 'registrationId')
  if (!eventId || !registrationId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID and Registration ID are required.')
  }

  const body = await readBody<{ payment_status?: string }>(event).catch(() => ({}))
  const paymentStatus = body.payment_status as RegistrationPaymentStatus | undefined

  if (!paymentStatus || !VALID_STATUSES.includes(paymentStatus)) {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      `payment_status must be one of: ${VALID_STATUSES.join(', ')}`
    )
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)

  // Check that the caller can manage this event (organizer or co-organizer)
  await assertCanRunEvent(serviceClient, eventId, playerProfile.id)

  const registrationRepo = createEventRegistrationRepository(serviceClient)
  const registration = await registrationRepo.findById(registrationId)

  if (!registration) {
    throw apiError(404, 'NOT_FOUND', 'Registration not found.')
  }

  if (registration.event_id !== eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Registration does not belong to this event.')
  }

  try {
    const updated = await registrationRepo.updatePaymentStatus(
      registrationId,
      paymentStatus,
      paymentStatus === 'paid' || paymentStatus === 'waived' ? playerProfile.id : null
    )

    return {
      data: updated,
      message: `Payment status updated to ${paymentStatus}`,
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[PATCH /api/v1/events/:eventId/registrations/:registrationId/payment] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update payment status.')
  }
})
