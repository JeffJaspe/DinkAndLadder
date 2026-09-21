import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService } from '~/server/domains/club/services/club.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Self-service — user-scoped client is enough. This lists clubs the caller already
 * belongs to (powers the "My Clubs" screen), not general club discovery/search — that's
 * Phase 2 per /docs/10-IMPLEMENTATION-BACKLOG.md and isn't implemented here.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your clubs.')
  }

  const client = await serverSupabaseClient(event)
  const serviceClient = await serverSupabaseServiceRole(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    return { items: [], page: 1, page_size: 0, total: 0, has_next: false }
  }

  const service = createClubService(
    createClubRepository(client),
    createClubMembershipRepository(client)
  )
  const assets = createBrandingAssetRepository(serviceClient)
  const memberships = await service.listMine(playerProfile.id)

  const items = await Promise.all(
    memberships.map(async (m) => {
      const clubRecord = await createClubRepository(client).findById(m.club.id)
      if (!clubRecord) return m
      const [logo_url, cover_photo_url] = await Promise.all([
        clubRecord.logo_path ? assets.resolveUrl(clubRecord.logo_path) : Promise.resolve(null),
        clubRecord.cover_photo_path
          ? assets.resolveUrl(clubRecord.cover_photo_path)
          : Promise.resolve(null)
      ])
      return { ...m, club: { ...m.club, logo_url, cover_photo_url } }
    })
  )

  return { items, page: 1, page_size: items.length, total: items.length, has_next: false }
})
