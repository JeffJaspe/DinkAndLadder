import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { toClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Self-service — user-scoped client is enough. This lists clubs the caller already
 * belongs to (powers the "My Clubs" screen), not general club discovery/search — that's
 * Phase 2 per /docs/10-IMPLEMENTATION-BACKLOG.md and isn't implemented here.
 *
 * Performance: the join in listOwnWithClub already fetches club data including
 * logo_path and cover_photo_path. We resolve URLs in parallel without extra queries.
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

  const membershipRepo = createClubMembershipRepository(client)
  const assets = createBrandingAssetRepository(serviceClient)

  // Single query: memberships with clubs joined (includes logo_path, cover_photo_path)
  const memberships = await membershipRepo.listOwnWithClub(playerProfile.id)

  // Resolve all URLs in parallel - no extra DB queries needed
  const items = await Promise.all(
    memberships.map(async (m) => {
      const club = m.club
      const [logo_url, cover_photo_url] = await Promise.all([
        club.logo_path ? assets.resolveUrl(club.logo_path) : Promise.resolve(null),
        club.cover_photo_path ? assets.resolveUrl(club.cover_photo_path) : Promise.resolve(null)
      ])
      return {
        ...toClubMembershipDto(m),
        club: {
          id: club.id,
          name: club.name,
          slug: club.slug,
          description: club.description,
          province: club.province,
          city: club.city,
          barangay: club.barangay,
          court_name: club.court_name,
          court_address: club.court_address,
          visibility: club.visibility,
          status: club.status,
          created_at: club.created_at,
          verification_status: club.verification_status,
          verification_requested_at: club.verification_requested_at,
          verified_at: club.verified_at,
          logo_url,
          cover_photo_url
        }
      }
    })
  )

  return { items, page: 1, page_size: items.length, total: items.length, has_next: false }
})
