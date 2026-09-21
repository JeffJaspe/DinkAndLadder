import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')
  }

  const client = await serverSupabaseClient(event)
  const serviceClient = await serverSupabaseServiceRole(event)
  const membershipRepo = createClubMembershipRepository(client)
  const assets = createBrandingAssetRepository(serviceClient)

  const memberships = await membershipRepo.listOwnWithClub(playerId)

  const items = await Promise.all(
    memberships
      .filter((m) => m.status === 'active')
      .map(async (m) => {
        const logo_url = m.club.logo_path
          ? await assets.resolveUrl(m.club.logo_path)
          : null
        return {
          club: {
            id: m.club.id,
            name: m.club.name,
            logo_url,
            is_verified: m.club.verification_status === 'verified'
          }
        }
      })
  )

  return { items }
})
