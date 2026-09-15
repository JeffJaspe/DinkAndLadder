import { readBody } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { EventServiceError } from '~/server/domains/event/services/event.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { buildCoOrganizerService, listCoOrganizerDtos } from '~/server/utils/co-organizers'

/**
 * Appoint a co-organiser. Creator only, friends only — both checked in the
 * service. Answers with the full list so the page has nothing to merge.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage co-organisers.')

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) throw apiError(400, 'VALIDATION_ERROR', 'eventId is required.')

  const body = await readBody<{ player_id?: unknown }>(event)
  if (typeof body?.player_id !== 'string' || !body.player_id) {
    throw apiError(400, 'VALIDATION_ERROR', 'player_id is required.')
  }

  const profile = await createPlayerProfileRepository(
    await serverSupabaseClient(event)
  ).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')

  const { service } = buildCoOrganizerService(event)
  try {
    await service.add(profile.id, eventId, body.player_id)
  } catch (err) {
    if (err instanceof EventServiceError) throw apiError(err.status, err.code, err.message)
    throw err
  }
  return { data: await listCoOrganizerDtos(event, eventId), message: 'Co-organiser added' }
})
