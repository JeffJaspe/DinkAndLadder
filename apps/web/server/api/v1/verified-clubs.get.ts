import { serverSupabaseClient } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubVerificationService } from '~/server/domains/club/services/club-verification.service'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { apiError } from '~/server/utils/api-error'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed
}

/**
 * Public, no auth required — same posture as GET /api/v1/clubs/search. Uses the plain
 * client since findVerifiedClubs only ever selects public+active+verified rows, which
 * the existing clubs_select_visible RLS policy already permits to everyone.
 */
export default defineEventHandler(async (event) => {
  const rawQuery = getQuery(event)
  const limit = Math.min(parsePositiveInt(rawQuery.limit, DEFAULT_LIMIT), MAX_LIMIT)
  const offset = parsePositiveInt(rawQuery.offset, 0)

  const client = await serverSupabaseClient(event)
  const service = createClubVerificationService(
    createClubRepository(client),
    createClubMembershipRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )

  try {
    const clubs = await service.listVerifiedClubs(limit, offset)
    return { data: clubs, request_id: crypto.randomUUID() }
  } catch (err) {
    console.error('[GET /api/v1/verified-clubs] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not list verified clubs.')
  }
})
