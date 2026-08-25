import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import { createTeamUpService } from '~/server/domains/partnership/services/team-up.service'
import { apiError } from '~/server/utils/api-error'

/**
 * Your roster, and the rosters you have been asked to join.
 *
 * Both in one response because the Team tab shows them together — an incoming
 * request is the thing you act on, and splitting it into a second round trip
 * would only delay the badge.
 *
 * User client: `team_ups_select_own` already limits rows to the two people each
 * one concerns, so RLS does the filtering rather than the query.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to see your team.')

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')

  const service = createTeamUpService(createTeamUpRepository(client))

  const [team, incoming] = await Promise.all([
    service.getTeam(profile.id),
    service.getIncoming(profile.id)
  ])

  return { team, incoming }
})
