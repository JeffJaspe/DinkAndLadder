import type { AchievementRepository } from '../repositories/achievement.repository'
import type { AchievementDefinitionDto, PlayerAchievementDto } from '../dto/achievement.dto'
import { toAchievementDefinitionDto } from '../dto/achievement.dto'

export class AchievementServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface AchievementService {
  getAllDefinitions(): Promise<AchievementDefinitionDto[]>
  getPlayerAchievements(playerId: string): Promise<PlayerAchievementDto[]>
  claimAchievement(playerId: string, achievementId: string): Promise<PlayerAchievementDto>
  getPlayerPoints(playerId: string): Promise<number>
}

export function createAchievementService(achievements: AchievementRepository): AchievementService {
  return {
    async getAllDefinitions() {
      const records = await achievements.findAllDefinitions()
      return records.map(toAchievementDefinitionDto)
    },

    async getPlayerAchievements(playerId) {
      const records = await achievements.findPlayerAchievements(playerId)
      return records.map((r) => ({
        id: r.id,
        player_id: r.player_id,
        achievement: toAchievementDefinitionDto(r.achievement_definitions),
        unlocked_at: r.unlocked_at,
        claimed_at: r.claimed_at
      }))
    },

    async claimAchievement(playerId, achievementId) {
      const existing = await achievements.findPlayerAchievement(playerId, achievementId)
      if (!existing) {
        throw new AchievementServiceError(404, 'NOT_FOUND', 'Achievement not unlocked.')
      }
      if (existing.claimed_at) {
        throw new AchievementServiceError(409, 'ALREADY_CLAIMED', 'Achievement already claimed.')
      }

      const updated = await achievements.claimAchievement(existing.id)
      const definition = await achievements.findDefinitionById(achievementId)
      if (!definition) {
        throw new AchievementServiceError(404, 'NOT_FOUND', 'Achievement definition not found.')
      }

      return {
        id: updated.id,
        player_id: updated.player_id,
        achievement: toAchievementDefinitionDto(definition),
        unlocked_at: updated.unlocked_at,
        claimed_at: updated.claimed_at
      }
    },

    async getPlayerPoints(playerId) {
      return achievements.countPlayerAchievementPoints(playerId)
    }
  }
}

/**
 * `createAchievementUnlocker` was removed here.
 *
 * It offered six entry points — checkMatchMilestones, checkWinMilestones,
 * checkRatingMilestones, checkSocialMilestones, checkClubMilestones,
 * checkTournamentMilestones — each of which had to be remembered at a
 * different call site, each swallowing its own errors, and **not one of them
 * was ever called from application code.** Sixteen achievements were seeded,
 * rendered on a page, and awarded to nobody, for as long as the feature
 * existed.
 *
 * Its replacement is one idempotent function that re-reads the player's whole
 * record and grants the difference: achievement-evaluator.service.ts, reached
 * through server/utils/award-achievements.ts. Six things to remember became
 * one, which is the only version of this that stays wired up.
 */
