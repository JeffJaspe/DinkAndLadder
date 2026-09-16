import type { AchievementRepository } from '../repositories/achievement.repository'
import type { AchievementStatsRepository } from '../repositories/achievement-stats.repository'
import type { AchievementCategory, AchievementTier } from '../dto/achievement.dto'
import { ACHIEVEMENT_REQUIREMENTS } from './achievement-requirements'

/**
 * The whole set of earnable badges, each marked with whether this player holds
 * it and — when they do not — what it would take.
 *
 * One payload for the gallery rather than the two the page used to stitch
 * together client-side (`/achievements` plus `/players/me/achievements`, joined
 * by id in a computed). That join belonged on the server: only the server can
 * say how close somebody is, because progress is read from the same stats the
 * unlock decision uses, and a locked badge with no stated requirement is the
 * thing that made the old gallery meaningless.
 */
export interface GalleryEntryDto {
  id: string
  key: string
  name: string
  description: string
  icon: string | null
  category: AchievementCategory
  tier: AchievementTier
  points: number
  earned: boolean
  /** ISO timestamp, or null while locked. */
  earned_at: string | null
  /** What to do to earn it. Present on locked entries only. */
  hint: string | null
  /** Countable progress, where the requirement is a count. Null otherwise. */
  progress: { current: number; target: number } | null
  /**
   * The requirement is already satisfied but the badge has not been granted
   * yet — it lands the next time something re-runs the evaluator for this
   * player.
   *
   * Real, and visible on this page today: achievements are awarded from here
   * forward with no backfill, so a player with 40 matches who joined before
   * any of this existed sees "Play 10 recorded matches · 10 / 10" on a locked
   * badge. A full progress bar under a padlock reads as a broken page, so the
   * gallery names the state instead of drawing the bar.
   */
  pending: boolean
}

export interface AchievementGalleryDto {
  entries: GalleryEntryDto[]
  earned_count: number
  total_count: number
  total_points: number
  /** Points available across everything still locked — what is left to play for. */
  points_remaining: number
}

export interface AchievementGalleryService {
  /**
   * `userId` is needed for the one requirement recorded against an account
   * rather than a player profile (clubs.created_by_user_id). Pass null when
   * viewing somebody else's gallery from a context that has no account id;
   * `club_founder` then reads as unearned, which is why the public profile
   * shows earned badges rather than this gallery.
   */
  forPlayer(playerId: string, userId: string | null): Promise<AchievementGalleryDto>
}

export function createAchievementGalleryService(
  achievements: AchievementRepository,
  stats: AchievementStatsRepository
): AchievementGalleryService {
  return {
    async forPlayer(playerId, userId) {
      const [definitions, held, playerStats] = await Promise.all([
        achievements.findAllDefinitions(),
        achievements.findPlayerAchievements(playerId),
        stats.gather(playerId, userId)
      ])

      const earnedAt = new Map(held.map((h) => [h.achievement_id, h.unlocked_at]))

      const entries: GalleryEntryDto[] = definitions.map((definition) => {
        const unlockedAt = earnedAt.get(definition.id) ?? null
        const requirement = ACHIEVEMENT_REQUIREMENTS[definition.key]
        const earned = unlockedAt !== null

        return {
          id: definition.id,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          category: definition.category,
          tier: definition.tier,
          points: definition.points,
          earned,
          earned_at: unlockedAt,
          // A definition with no rule cannot be earned, so it says so plainly
          // instead of offering a requirement that does not exist. In practice
          // this is unreachable — awardAchievements logs any such definition —
          // but the gallery should not be the place it becomes a silent lie.
          hint: earned ? null : (requirement?.hint ?? 'Not available yet'),
          progress: earned ? null : (requirement?.progress?.(playerStats) ?? null),
          pending: !earned && (requirement?.met(playerStats) ?? false)
        }
      })

      // Tier order, then points: a gallery sorted by the database's own
      // category/points ordering scattered the four rating tiers across the
      // page. Within a category a player reads them as a ladder, so they are
      // laid out as one.
      const tierOrder: Record<AchievementTier, number> = {
        bronze: 0,
        silver: 1,
        gold: 2,
        platinum: 3
      }
      entries.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.points - b.points)

      const earned = entries.filter((e) => e.earned)

      return {
        entries,
        earned_count: earned.length,
        total_count: entries.length,
        total_points: earned.reduce((sum, e) => sum + e.points, 0),
        points_remaining: entries.filter((e) => !e.earned).reduce((sum, e) => sum + e.points, 0)
      }
    }
  }
}
