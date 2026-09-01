import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingBackfillService } from '~/server/domains/rating/services/rating-backfill.service'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { apiError } from '~/server/utils/api-error'

const MAX_LIMIT = 500

/**
 * Replays verified matches through the rating engine. SuperAdmin only.
 *
 * An endpoint rather than a standalone script because the work is business
 * logic, not SQL: it has to run through RatingService so that every replayed
 * match uses the same algorithm, the same version stamp and the same
 * idempotency check as a live one. A script writing rating rows directly would
 * be a second implementation of the rating engine, and the two would drift.
 *
 * Paged and re-runnable rather than one long request: rating is sequential by
 * necessity (see the service's ordering note), so a few thousand matches would
 * outlast any sensible request timeout. Call it repeatedly with the
 * `next_offset` from the previous response until `has_more` is false.
 *
 * Body (all optional):
 *   limit   — matches per page, default 100, max 500
 *   offset  — where to resume, default 0
 *   dry_run — count what would be rated without writing anything
 */
/**
 * Whether this deployment may run the backfill at all.
 *
 * SuperAdmin is not a sufficient guard here. This endpoint rewrites ratings
 * and rating history in bulk, and there is no "unrate" — so on production the
 * only safe number of ways to trigger it is zero, however trusted the caller.
 *
 * Local development is allowed outright. Anywhere else has to opt in with an
 * explicit environment variable, so enabling it on the dev deployment is a
 * deliberate act and production stays off by never setting it.
 */
function backfillAllowedHere(): boolean {
  if (import.meta.dev) return true
  return process.env.NUXT_ALLOW_RATING_BACKFILL === 'true'
}

export default defineEventHandler(async (event) => {
  if (!backfillAllowedHere()) {
    throw apiError(
      403,
      'NOT_AVAILABLE_HERE',
      'The rating backfill is disabled on this environment. It runs against development only.'
    )
  }

  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to run the rating backfill.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can run the rating backfill.')
  }

  const body = (await readBody(event)) as Record<string, unknown> | null

  if (body?.limit !== undefined && typeof body.limit !== 'number') {
    throw apiError(400, 'VALIDATION_ERROR', 'limit must be a number.')
  }
  if (body?.offset !== undefined && typeof body.offset !== 'number') {
    throw apiError(400, 'VALIDATION_ERROR', 'offset must be a number.')
  }
  if (body?.dry_run !== undefined && typeof body.dry_run !== 'boolean') {
    throw apiError(400, 'VALIDATION_ERROR', 'dry_run must be a boolean.')
  }

  const service = createRatingBackfillService(
    createMatchRepository(client),
    createRatingService(createRatingRepository(client)),
    createRatingRepository(client)
  )

  try {
    const report = await service.run({
      limit: Math.min((body?.limit as number) ?? 100, MAX_LIMIT),
      offset: (body?.offset as number) ?? 0,
      dryRun: (body?.dry_run as boolean) ?? false
    })
    return { data: report, request_id: crypto.randomUUID() }
  } catch (err) {
    console.error('[POST /api/v1/admin/rating/backfill] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'The rating backfill could not complete.')
  }
})
