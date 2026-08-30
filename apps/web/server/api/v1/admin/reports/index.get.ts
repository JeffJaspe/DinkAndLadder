import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createReportRepository } from '~/server/domains/moderation/repositories/report.repository'
import { createReportService } from '~/server/domains/moderation/services/report.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

/**
 * The moderation queue. SuperAdmin only.
 *
 * This is the one endpoint that returns reporter identities, so the authorization
 * check comes first and there is no RLS policy behind it to fall back on - if
 * this check is wrong, the data is exposed. See 037-moderation.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to review reports.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can review reports.')
  }

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(Number(query.offset) || 0, 0)

  const service = createReportService(
    createReportRepository(client),
    createPlayerProfileRepository(client),
    createNotificationService(createNotificationRepository(client))
  )

  try {
    const { items, total } = await service.listForAdmin({ status, limit, offset })

    // Names for both sides, resolved here rather than in the repository: the
    // queue is the only caller that needs them, and a join in the repository
    // would put reporter identity into a shape other callers could reach for.
    const enriched = await withPlayerNames(client, items)

    return { data: enriched, total, request_id: crypto.randomUUID() }
  } catch (err) {
    console.error('[GET /api/v1/admin/reports] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load reports.')
  }
})

async function withPlayerNames<
  T extends { reporter_player_id: string | null; reported_player_id: string }
>(client: SupabaseClient, reports: T[]) {
  const ids = [
    ...new Set(reports.flatMap((r) => [r.reporter_player_id, r.reported_player_id]).filter(Boolean))
  ] as string[]

  if (ids.length === 0) return reports.map((r) => ({ ...r, reporter: null, reported: null }))

  const { data } = await client.from('player_profiles').select('id, display_name').in('id', ids)

  const names = new Map(
    ((data ?? []) as { id: string; display_name: string | null }[]).map((p) => [
      p.id,
      p.display_name
    ])
  )

  return reports.map((r) => ({
    ...r,
    reporter: r.reporter_player_id
      ? { id: r.reporter_player_id, display_name: names.get(r.reporter_player_id) ?? 'Unknown' }
      : null,
    reported: {
      id: r.reported_player_id,
      display_name: names.get(r.reported_player_id) ?? 'Unknown'
    }
  }))
}
