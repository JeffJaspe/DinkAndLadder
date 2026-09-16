import type { SupabaseClient } from '@supabase/supabase-js'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementStatsRepository } from '~/server/domains/achievement/repositories/achievement-stats.repository'
import { createAchievementEvaluator } from '~/server/domains/achievement/services/achievement-evaluator.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import type { CreateNotificationInput } from '~/server/domains/notification/dto/notification.dto'

/**
 * Re-check a player's achievements after something happened that could have
 * earned them one, and tell them about anything new.
 *
 * Cross-domain — achievement, player, notification — so it sits in the API
 * layer's utils next to settleVerifiedMatch, for the same reason.
 *
 * **Best-effort, and silent on failure by design.** Every caller is a request
 * that has already done its real work: a match is recorded, a profile is
 * created, a club is joined. None of them should fail, or make the player wait,
 * because a badge could not be granted. The evaluator is idempotent, so a run
 * that is lost is picked up by the next one — or by the SuperAdmin
 * recalculation tool, which exists partly for this.
 *
 * Call it with `await` where the caller is already async and cheap, or let the
 * promise float where latency matters; either is safe.
 */
export async function awardAchievements(
  serviceClient: SupabaseClient,
  playerId: string,
  userId: string | null
): Promise<void> {
  try {
    const evaluator = createAchievementEvaluator(
      createAchievementRepository(serviceClient),
      createAchievementStatsRepository(serviceClient)
    )

    const result = await evaluator.evaluate(playerId, userId)
    if (result.unmapped.length) {
      console.warn(
        `[achievements] ${result.unmapped.length} active definition(s) have no rule and can never be earned:`,
        result.unmapped.join(', ')
      )
    }
    if (!result.unlocked.length || !userId) return

    const messages: CreateNotificationInput[] = result.unlocked.map((achievement) => ({
      user_id: userId,
      type: 'achievement.unlocked',
      title: `Badge earned: ${achievement.name}`,
      // The description is what the badge is FOR, so it doubles as the reason
      // this arrived — the notification never has to explain itself twice.
      body: `${achievement.description}. Worth ${achievement.points} ${achievement.points === 1 ? 'point' : 'points'}, and you can now show it on your profile.`,
      reference_type: 'achievement',
      reference_id: achievement.id
    }))

    await createNotificationService(createNotificationRepository(serviceClient)).notifyMany(
      messages
    )
  } catch (err) {
    console.error(`[achievements] evaluation failed for player ${playerId}:`, err)
  }
}

/**
 * The same thing for everybody in a match, in parallel.
 *
 * A doubles result can move four players across the matches, wins and rating
 * milestones at once, and each evaluation is independent.
 */
export async function awardAchievementsForPlayers(
  serviceClient: SupabaseClient,
  players: { playerId: string; userId: string | null }[]
): Promise<void> {
  await Promise.all(players.map((p) => awardAchievements(serviceClient, p.playerId, p.userId)))
}
