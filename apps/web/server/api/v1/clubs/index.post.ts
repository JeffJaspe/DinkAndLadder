import { serverSupabaseClient } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubService } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { ClubVisibility, CreateClubInput } from '~/server/domains/club/dto/club.dto'
import { slugProblemMessage, validateSlug } from '~/server/domains/club/dto/club-slug'
import { getOptionalUser } from '~/server/utils/optional-user'

function parseCreateInput(body: unknown): CreateClubInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'name is required.')
  }
  if (typeof record.slug !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'slug is required.')
  }
  // Same rules as the edit path (see club-slug.ts). This carried its own inline
  // regex, which accepted reserved words like "admin" and "settings" - now that
  // a slug is a routable address rather than a stored string, one of those is a
  // club permanently squatting a platform route.
  const slug = record.slug.trim().toLowerCase()
  const slugProblem = validateSlug(slug)
  if (slugProblem) {
    throw apiError(400, 'INVALID_SLUG', slugProblemMessage(slugProblem))
  }

  const input: CreateClubInput = { name: record.name.trim(), slug }

  for (const field of ['description', 'province', 'city'] as const) {
    const value = record[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      throw apiError(400, 'VALIDATION_ERROR', `${field} must be a string or null.`)
    }
    input[field] = value
  }

  if (record.visibility !== undefined) {
    if (record.visibility !== 'public' && record.visibility !== 'private') {
      throw apiError(400, 'VALIDATION_ERROR', "visibility must be 'public' or 'private'.")
    }
    input.visibility = record.visibility as ClubVisibility
  }

  return input
}

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to create a club.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before creating a club.'
    )
  }

  const input = parseCreateInput(await readBody(event))
  const service = createClubService(
    createClubRepository(client),
    createClubMembershipRepository(client)
  )

  try {
    const club = await service.createClub(claims.sub, playerProfile.id, input)
    return {
      data: club,
      message: 'Club created',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    // 23505 = Postgres unique_violation. Never forward the raw db error to the client,
    // but do log it server-side — silently swallowing unexpected errors makes them
    // impossible to diagnose later.
    if ((err as { code?: string })?.code === '23505') {
      throw apiError(409, 'CONFLICT', 'A club with that slug already exists.')
    }
    console.error('[POST /api/v1/clubs] createClub failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not create the club.')
  }
})
