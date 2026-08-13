import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { apiError } from '~/server/utils/api-error'
import type { UpdatePlayerProfileInput } from '~/server/domains/player/dto/player-profile.dto'

const OPTIONAL_TEXT_FIELDS = [
  'first_name',
  'last_name',
  'bio',
  'province',
  'city',
  'dominant_hand',
  'preferred_position'
] as const

function parseUpdateInput(body: unknown): UpdatePlayerProfileInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }

  const record = body as Record<string, unknown>

  if (typeof record.display_name !== 'string' || record.display_name.trim().length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'display_name is required.')
  }

  const input: UpdatePlayerProfileInput = { display_name: record.display_name.trim() }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = record[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      throw apiError(400, 'VALIDATION_ERROR', `${field} must be a string or null.`)
    }
    input[field] = value
  }

  if (record.profile_visibility !== undefined) {
    if (record.profile_visibility !== 'public' && record.profile_visibility !== 'private') {
      throw apiError(400, 'VALIDATION_ERROR', "profile_visibility must be 'public' or 'private'.")
    }
    input.profile_visibility = record.profile_visibility
  }

  return input
}

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to edit your player profile.')
  }

  const input = parseUpdateInput(await readBody(event))

  const client = await serverSupabaseClient(event)
  const service = createPlayerProfileService(createPlayerProfileRepository(client))
  const profile = await service.saveOwnProfile(claims.sub, input)

  return {
    data: profile,
    message: 'Profile saved',
    request_id: crypto.randomUUID()
  }
})
