import type { BadgeRepository } from '../repositories/badge.repository'
import type { BadgeDto, BadgeShowcaseDto } from '../dto/badge.dto'
import { badgeShowcaseRecordToDto } from '../dto/badge.dto'
import type { AchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'

export class BadgeServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface BadgeService {
  getShowcase(playerId: string): Promise<BadgeShowcaseDto | null>
  /** Every badge this player has actually earned, newest first. */
  getEarnedBadges(playerId: string): Promise<BadgeDto[]>
  /** The badge on their profile right now, or null. Resolved against what they hold. */
  getSelectedBadge(playerId: string): Promise<BadgeDto | null>
  /**
   * Put a badge on the profile, or clear it with null.
   *
   * Rejects anything the player has not unlocked. This is the whole point of
   * the change: the previous implementation validated the id against a
   * hard-coded list and nothing else, so any badge in that list could be worn
   * by anyone who could send a PUT — including straight from a shell, since the
   * only gate was a client that offered the full list anyway.
   */
  setSelectedBadge(playerId: string, badgeKey: string | null): Promise<BadgeShowcaseDto>
}

export function createBadgeService(
  badgeRepository: BadgeRepository,
  achievements: AchievementRepository
): BadgeService {
  async function earned(playerId: string): Promise<BadgeDto[]> {
    const held = await achievements.findPlayerAchievements(playerId)
    return held
      .filter((row) => row.achievement_definitions?.is_active)
      .map((row) => ({
        id: row.achievement_definitions.key,
        name: row.achievement_definitions.name,
        icon: row.achievement_definitions.icon,
        description: row.achievement_definitions.description,
        tier: row.achievement_definitions.tier,
        earnedAt: row.unlocked_at
      }))
  }

  return {
    async getShowcase(playerId) {
      const record = await badgeRepository.findByPlayerId(playerId)
      return record ? badgeShowcaseRecordToDto(record) : null
    },

    getEarnedBadges: earned,

    async getSelectedBadge(playerId) {
      const record = await badgeRepository.findByPlayerId(playerId)
      if (!record?.selected_badge_id) return null

      // Resolved against what they hold rather than simply rendered from the
      // stored key, so a badge cannot survive on a profile after the
      // achievement behind it was retired or revoked.
      const badges = await earned(playerId)
      return badges.find((b) => b.id === record.selected_badge_id) ?? null
    },

    async setSelectedBadge(playerId, badgeKey) {
      if (badgeKey !== null) {
        const badges = await earned(playerId)
        if (!badges.some((b) => b.id === badgeKey)) {
          throw new BadgeServiceError(
            403,
            'BADGE_NOT_EARNED',
            'You can only show a badge you have earned.'
          )
        }
      }

      const record = await badgeRepository.upsert(playerId, badgeKey)
      return badgeShowcaseRecordToDto(record)
    }
  }
}
