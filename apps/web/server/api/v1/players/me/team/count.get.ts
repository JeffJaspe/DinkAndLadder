import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import { createTeamUpService } from '~/server/domains/partnership/services/team-up.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * How many team-up invitations are waiting for an answer.
 *
 * The mirror of `partner-requests/count.get.ts`, and it exists for the same
 * reason: a duo request has announced itself in the sidebar and on the Partners
 * tab since it was added, while a team-up request was only ever visible if you
 * happened to open the TeamUp tab and scroll to it. Two relationships that both
 * need an answer, one of which was asking quietly.
 *
 * Its own endpoint rather than `/players/me/team` plus `.length`: the badge is
 * fetched on every page, and that response embeds each sender's profile and
 * ratings.
 *
 * User client — `team_ups_select_own` already limits rows to the two people
 * each one concerns, so RLS does the filtering.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your team-up requests.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const service = createTeamUpService(createTeamUpRepository(client))
  const incoming = await service.countIncoming(profile.id)

  return { data: { incoming }, request_id: crypto.randomUUID() }
})
