import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { toEventDto } from '~/server/domains/event/dto/event.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Stop a session taking players, without ending the event.
 *
 * Distinct from `/complete`, which moves the event to `completed` and is what
 * you call when the session is over. Closing says "no more entries" while play
 * carries on — a drop-in session that has filled up, or one the organiser has
 * decided is settled, still has matches to finish and scores to record.
 *
 * The counterpart to the `scheduled` close policy: this is the manual one. A
 * scheduled session closes itself by the clock (registration checks `closes_at`
 * directly, so it takes effect on time whether or not anything has swept it),
 * and calling this on one simply closes it early.
 *
 * Idempotent: closing an already-closed session returns it unchanged rather
 * than erroring, since the caller's intent is already satisfied.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to close a session.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId is required.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'FORBIDDEN', 'Player profile required.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const events = createEventRepository(serviceClient)

  const existing = await events.findById(eventId)
  if (!existing) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }
  if (existing.created_by_player_id !== profile.id) {
    throw apiError(403, 'FORBIDDEN', 'Only the organiser can close this session.')
  }

  if (existing.closed_at) {
    return { data: toEventDto(existing), request_id: crypto.randomUUID() }
  }

  const updated = await events.update(eventId, { closed_at: new Date().toISOString() })
  return { data: toEventDto(updated), request_id: crypto.randomUUID() }
})
