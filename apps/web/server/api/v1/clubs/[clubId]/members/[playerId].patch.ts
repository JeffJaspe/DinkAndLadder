import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { UpdateMembershipInput } from '~/server/domains/club/dto/club-membership.dto'

function parseUpdateInput(body: unknown): UpdateMembershipInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>
  const input: UpdateMembershipInput = {}

  if (record.status !== undefined) {
    if (!['active', 'rejected', 'left'].includes(record.status as string)) {
      throw apiError(400, 'VALIDATION_ERROR', "status must be 'active', 'rejected', or 'left'.")
    }
    input.status = record.status as UpdateMembershipInput['status']
  }
  if (record.role !== undefined) {
    if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(record.role as string)) {
      throw apiError(400, 'VALIDATION_ERROR', "role must be 'ADMIN', 'MODERATOR', or 'MEMBER'.")
    }
    input.role = record.role as UpdateMembershipInput['role']
  }
  if (!input.status && !input.role) {
    throw apiError(400, 'VALIDATION_ERROR', 'Provide at least one of status or role.')
  }

  return input
}

/**
 * Admin-only mutation of someone else's membership (approve/reject a request, change role,
 * remove). Uses the service-role client — see 008-security's note on why this path isn't
 * RLS-enforced. ClubService.updateMember is where the actual permission matrix lives and is
 * checked before any write happens.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage club members.')
  }

  const clubId = getRouterParam(event, 'clubId')
  const targetPlayerId = getRouterParam(event, 'playerId')
  if (!clubId || !targetPlayerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId and playerId are required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot be a club admin.')
  }

  const input = parseUpdateInput(await readBody(event))
  const serviceClient = serverSupabaseServiceRole(event)
  const service = createClubService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient)
  )

  try {
    const membership = await service.updateMember(playerProfile.id, clubId, targetPlayerId, input)
    return { data: membership, message: 'Member updated', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(
      `[PATCH /api/v1/clubs/${clubId}/members/${targetPlayerId}] updateMember failed:`,
      err
    )
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update that member.')
  }
})
