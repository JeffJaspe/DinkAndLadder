import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import {
  createClubBrandingService,
  ClubBrandingServiceError,
  isClubImageSlot
} from '~/server/domains/club/services/club-branding.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Remove a club's cover photo or logo.
 *
 * Clearing is not the same as leaving it blank: the club falls back to
 * `UiCoverArt`, which generates a banner deterministically from the club name
 * and is a finished design rather than a grey placeholder.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change club images.')
  }

  const clubId = getRouterParam(event, 'clubId')
  const slot = getRouterParam(event, 'slot')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }
  if (!isClubImageSlot(slot)) {
    throw apiError(404, 'NOT_FOUND', 'No such club image slot.')
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot be a club admin.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const branding = createClubBrandingService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient),
    createBrandingAssetRepository(serviceClient)
  )

  try {
    const club = await branding.clearImage(profile.id, clubId, slot)
    return { data: club, message: 'Image removed', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubBrandingServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[DELETE /api/v1/clubs/${clubId}/images/${slot}] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not remove the image.')
  }
})
