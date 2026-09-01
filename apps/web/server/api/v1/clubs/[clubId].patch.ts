import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { UpdateClubInput } from '~/server/domains/club/repositories/club.repository'
import { slugProblemMessage, validateSlug } from '~/server/domains/club/dto/club-slug'
import { getOptionalUser } from '~/server/utils/optional-user'

function parseUpdateInput(body: unknown): UpdateClubInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>
  const input: UpdateClubInput = {}

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw apiError(400, 'VALIDATION_ERROR', 'name must be a non-empty string.')
    }
    input.name = record.name.trim()
  }
  for (const field of [
    'description',
    'province',
    'city',
    'barangay',
    'court_name',
    'court_address'
  ] as const) {
    const value = record[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      throw apiError(400, 'VALIDATION_ERROR', `${field} must be a string or null.`)
    }
    input[field] = value
  }
  if (record.slug !== undefined) {
    if (typeof record.slug !== 'string') {
      throw apiError(400, 'VALIDATION_ERROR', 'slug must be a string.')
    }
    // Normalised before validation so trailing whitespace or a capital letter
    // is corrected rather than rejected - people type a club URL, they do not
    // compose one.
    const slug = record.slug.trim().toLowerCase()
    const problem = validateSlug(slug)
    if (problem) {
      throw apiError(400, 'INVALID_SLUG', slugProblemMessage(problem))
    }
    input.slug = slug
  }

  if (record.visibility !== undefined) {
    if (record.visibility !== 'public' && record.visibility !== 'private') {
      throw apiError(400, 'VALIDATION_ERROR', "visibility must be 'public' or 'private'.")
    }
    input.visibility = record.visibility
  }

  return input
}

/**
 * Edits go through the service-role client — clubs has no UPDATE RLS policy for the
 * authenticated role by design (see 008-security). Authorization (owner/admin only) is
 * checked in ClubService.updateClub before this bypass is used, not skipped.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to edit a club.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
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
    const club = await service.updateClub(playerProfile.id, clubId, input)
    return { data: club, message: 'Club updated', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    // 23505 = Postgres unique_violation, which here means another club already
    // holds the requested slug. The repository throws a wrapped Error, so the
    // code can be on the error itself or on its cause.
    const code =
      (err as { code?: string })?.code ??
      ((err as { cause?: { code?: string } })?.cause?.code || undefined)
    if (code === '23505') {
      throw apiError(409, 'SLUG_TAKEN', 'That club URL is already taken. Try another.')
    }
    console.error(`[PATCH /api/v1/clubs/${clubId}] updateClub failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the club.')
  }
})
