import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import {
  createTeamUpService,
  TeamUpServiceError
} from '~/server/domains/partnership/services/team-up.service'
import { apiError } from '~/server/utils/api-error'

/**
 * Accept or decline being added to a roster.
 *
 * The consent is the point: an accepted team-up lets the owner commit your
 * evening, so only the person being added may answer. The service enforces that
 * rather than trusting the id in the URL.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to answer.')

  const teamUpId = getRouterParam(event, 'teamUpId')
  if (!teamUpId) throw apiError(400, 'VALIDATION_ERROR', 'A team-up id is required.')

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')

  const body = await readBody<{ accept?: boolean }>(event)
  if (typeof body?.accept !== 'boolean') {
    throw apiError(400, 'VALIDATION_ERROR', 'An accept boolean is required.')
  }

  const service = createTeamUpService(createTeamUpRepository(serverSupabaseServiceRole(event)))

  try {
    const request = await service.respond(profile.id, teamUpId, body.accept)
    return { data: request, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof TeamUpServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/team-ups/:id/respond] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not answer that request.')
  }
})
