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
 * End a team-up.
 *
 * Either side may: the owner drops a member, the member leaves. Owner-only
 * removal would leave a player permanently registrable by somebody they have
 * fallen out with, which is exactly the situation consent is meant to prevent.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change your team.')

  const teamUpId = getRouterParam(event, 'teamUpId')
  if (!teamUpId) throw apiError(400, 'VALIDATION_ERROR', 'A team-up id is required.')

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')

  const service = createTeamUpService(createTeamUpRepository(serverSupabaseServiceRole(event)))

  try {
    await service.remove(profile.id, teamUpId)
    setResponseStatus(event, 204)
    return null
  } catch (err) {
    if (err instanceof TeamUpServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[DELETE /api/v1/team-ups/:id] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not remove that team-up.')
  }
})
