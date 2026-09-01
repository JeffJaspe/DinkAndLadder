import { serverSupabaseServiceRole } from '#supabase/server'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * How many duo requests are waiting for an answer.
 *
 * Deliberately its own endpoint rather than `incoming.get.ts` plus `.length`:
 * the sidebar asks for this on every page, and `incoming` enriches each request
 * with the sender's profile and rating — a per-request round trip that a badge
 * showing a number has no use for.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your partner requests.')
  }

  const client = serverSupabaseServiceRole(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const pending = await createPartnershipRepository(client).findPendingRequestsTo(profile.id)

  return { data: { incoming: pending.length }, request_id: crypto.randomUUID() }
})
