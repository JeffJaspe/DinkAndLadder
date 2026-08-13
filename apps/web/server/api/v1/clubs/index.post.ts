import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubService } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { ClubVisibility, CreateClubInput } from '~/server/domains/club/dto/club.dto'

function parseCreateInput(body: unknown): CreateClubInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'name is required.')
  }
  if (typeof record.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(record.slug)) {
    throw apiError(400, 'VALIDATION_ERROR', 'slug is required and must be lowercase-kebab-case.')
  }

  const input: CreateClubInput = { name: record.name.trim(), slug: record.slug }

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
  const claims = await serverSupabaseUser(event)
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
