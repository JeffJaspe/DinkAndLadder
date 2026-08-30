import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubBrandingService } from '~/server/domains/club/services/club-branding.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { looksLikeUuid } from '~/server/domains/club/dto/club-slug'
import { toClubDto } from '~/server/domains/club/dto/club.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * A club by id *or* by its custom URL.
 *
 * `clubs.slug` and `ClubRepository.findBySlug()` have both existed since
 * 003-club, but nothing ever called findBySlug and no route resolved one, so
 * every club link was a raw UUID. The parameter is now resolved by shape: a
 * UUID is looked up by id, anything else by slug.
 *
 * Both keep working on purpose. Changing a slug must never break a link already
 * printed on a poster or encoded in a QR code, so /clubs/<uuid> stays valid
 * forever rather than redirecting to the slug.
 *
 * No auth required - visibility is enforced by the clubs RLS policies, which is
 * why the lookup uses the user client.
 */
export default defineEventHandler(async (event) => {
  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const clubRepo = createClubRepository(client)

  const record = looksLikeUuid(clubId)
    ? await clubRepo.findById(clubId)
    : await clubRepo.findBySlug(clubId)

  if (!record) {
    throw apiError(404, 'NOT_FOUND', 'No club found with that id or URL.')
  }

  const club = toClubDto(record)

  // No images: nothing to sign, so skip the service-role client entirely.
  if (!record.cover_photo_path && !record.logo_path) {
    return club
  }

  // Image paths are stored bucket-relative and resolved per request, because
  // the URL shape depends on whether the bucket is public and a signed URL must
  // not outlive its signature (see 025-platform-branding). The DTO mapper is
  // pure, so it emits nulls and this fills them in. Service role is needed only
  // for the signing - the club itself was already read under RLS above.
  const branding = createClubBrandingService(
    clubRepo,
    createClubMembershipRepository(client),
    createBrandingAssetRepository(serverSupabaseServiceRole(event))
  )

  return branding.withImageUrls(club, {
    cover: record.cover_photo_path,
    logo: record.logo_path
  })
})
