import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import {
  createPartnershipService,
  PartnershipServiceError
} from '~/server/domains/partnership/services/partnership.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

interface SetDefaultPartnerBody {
  /** A confirmed partner's player id, or null to clear the duo. */
  partner_id?: string | null
}

/**
 * Set or clear the caller's default duo.
 *
 * Service-role client so the service can read both players' rows while
 * validating the target really is a confirmed partner — the owner-only RLS
 * policy on player_default_partners stays as defence in depth. Ownership is
 * never taken from the body: the row written is always the caller's own.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to set your duo.')
  }

  const body = await readBody<SetDefaultPartnerBody>(event)
  const raw = body?.partner_id

  if (raw !== null && raw !== undefined && typeof raw !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'partner_id must be a player id or null.')
  }
  const partnerId = typeof raw === 'string' && raw.trim() ? raw.trim() : null

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const service = createPartnershipService(createPartnershipRepository(client), playerRepo)

  try {
    const result = await service.setDefaultPartner(profile.id, partnerId)
    return {
      data: { partner_id: result },
      message: result ? 'Duo updated.' : 'Duo cleared.',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof PartnershipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error('[PUT /api/v1/players/me/default-partner] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update your duo.')
  }
})
