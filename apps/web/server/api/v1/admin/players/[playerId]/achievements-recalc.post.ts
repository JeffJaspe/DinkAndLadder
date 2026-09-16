import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createAuditRepository } from '~/server/domains/audit/repositories/audit.repository'
import { createAuditService } from '~/server/domains/audit/services/audit.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementStatsRepository } from '~/server/domains/achievement/repositories/achievement-stats.repository'
import { createAchievementEvaluator } from '~/server/domains/achievement/services/achievement-evaluator.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { requireAal2 } from '~/server/utils/mfa'

interface RecalcBody {
  /**
   * Whether the player is told about anything this run awards. Off by default:
   * the usual reason to run this is to repair a player whose achievements were
   * missed, and a dozen notifications arriving at once for things they did
   * months ago is noise, not news.
   */
  notify?: boolean
}

export interface AchievementRecalcReport {
  player_id: string
  display_name: string
  /** Keys awarded by this run. Empty when their record already matched. */
  awarded: string[]
  /** How many they already held before it ran. */
  already_held: number
  /** The record the decision was made on — the operator's evidence. */
  stats: Record<string, number | boolean | null>
  /** Active definitions with no rule behind them. Should always be empty. */
  unmapped: string[]
  notified: boolean
}

/**
 * Recalculate one player's achievements from their actual record.
 *
 * There is no bulk backfill, by decision: achievements are awarded from here
 * forward, and a player who joined earlier sees the locked gallery with its
 * requirements like everybody else. This tool is the escape hatch for the case
 * that is genuinely wrong rather than merely old — a hook that failed, a match
 * settled while the evaluator was erroring, a support request about a badge
 * somebody plainly earned.
 *
 * SuperAdmin only, aal2 only, audit-logged with what it awarded and the numbers
 * it decided on, because "an admin gave this player a badge" is exactly the
 * kind of grant that has to be answerable later.
 *
 * Grants only — it never revokes. A rating can fall back below 4.5 and an
 * achievement already earned is still a thing that happened; taking badges away
 * because a number moved would make them worthless.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')
  requireAal2(claims)

  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) throw apiError(400, 'VALIDATION_ERROR', 'Player ID is required.')

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can recalculate achievements.')
  }

  const body = await readBody<RecalcBody>(event).catch(() => undefined)
  const shouldNotify = body?.notify === true

  const profile = await createPlayerProfileRepository(client).findById(playerId)
  if (!profile) throw apiError(404, 'NOT_FOUND', 'Player profile not found.')

  const evaluator = createAchievementEvaluator(
    createAchievementRepository(client),
    createAchievementStatsRepository(client)
  )

  let result
  try {
    result = await evaluator.evaluate(profile.id, profile.user_id)
  } catch (err) {
    console.error(`[admin] achievement recalc failed for ${playerId}:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not recalculate achievements.')
  }

  if (shouldNotify && result.unlocked.length && profile.user_id) {
    await createNotificationService(createNotificationRepository(client)).notifyMany(
      result.unlocked.map((achievement) => ({
        user_id: profile.user_id,
        type: 'achievement.unlocked' as const,
        title: `Badge earned: ${achievement.name}`,
        body: `${achievement.description}. Worth ${achievement.points} ${achievement.points === 1 ? 'point' : 'points'}, and you can now show it on your profile.`,
        reference_type: 'achievement' as const,
        reference_id: achievement.id
      }))
    )
  }

  await createAuditService(createAuditRepository(client)).log({
    event_type: 'achievement.admin_recalculated',
    actor_user_id: claims.sub,
    actor_player_id: null,
    target_type: 'player_achievement',
    target_id: playerId,
    payload: {
      awarded: result.unlocked.map((a) => a.key),
      already_held: result.already_held,
      stats: result.stats,
      notified: shouldNotify
    }
  })

  const report: AchievementRecalcReport = {
    player_id: profile.id,
    display_name: profile.display_name,
    awarded: result.unlocked.map((a) => a.key),
    already_held: result.already_held,
    stats: result.stats as unknown as Record<string, number | boolean | null>,
    unmapped: result.unmapped,
    notified: shouldNotify && result.unlocked.length > 0
  }

  return { data: report }
})
