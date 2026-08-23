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

export function createAchievementUnlocker(achievements: AchievementRepository) {
  return {
    async checkAndUnlock(playerId: string, achievementKey: string): Promise<boolean> {
      try {
        const definition = await achievements.findDefinitionByKey(achievementKey)
        if (!definition) return false

        const existing = await achievements.findPlayerAchievement(playerId, definition.id)
        if (existing) return false

        await achievements.createPlayerAchievement(playerId, definition.id)
        return true
      } catch {
        return false
      }
    },

    async checkMatchMilestones(playerId: string, matchCount: number): Promise<string[]> {
      const unlocked: string[] = []

      if (matchCount >= 1 && (await this.checkAndUnlock(playerId, 'first_match'))) {
        unlocked.push('first_match')
      }
      if (matchCount >= 10 && (await this.checkAndUnlock(playerId, 'regular_player'))) {
        unlocked.push('regular_player')
      }
      if (matchCount >= 50 && (await this.checkAndUnlock(playerId, 'dedicated_player'))) {
        unlocked.push('dedicated_player')
      }
      if (matchCount >= 100 && (await this.checkAndUnlock(playerId, 'match_master'))) {
        unlocked.push('match_master')
      }

      return unlocked
    },

    async checkWinMilestones(playerId: string, winCount: number): Promise<string[]> {
      const unlocked: string[] = []

      if (winCount >= 1 && (await this.checkAndUnlock(playerId, 'first_victory'))) {
        unlocked.push('first_victory')
      }
      if (winCount >= 10 && (await this.checkAndUnlock(playerId, 'winner'))) {
        unlocked.push('winner')
      }
      if (winCount >= 50 && (await this.checkAndUnlock(playerId, 'champion'))) {
        unlocked.push('champion')
      }

      return unlocked
    },

    async checkRatingMilestones(playerId: string, rating: number | null): Promise<string[]> {
      const unlocked: string[] = []

      if (rating !== null) {
        if (await this.checkAndUnlock(playerId, 'rated_player')) {
          unlocked.push('rated_player')
        }
        if (rating >= 3.5 && (await this.checkAndUnlock(playerId, 'rising_star'))) {
          unlocked.push('rising_star')
        }
        if (rating >= 4.0 && (await this.checkAndUnlock(playerId, 'skilled_player'))) {
          unlocked.push('skilled_player')
        }
        if (rating >= 4.5 && (await this.checkAndUnlock(playerId, 'elite_player'))) {
          unlocked.push('elite_player')
        }
      }

      return unlocked
    },

    async checkSocialMilestones(playerId: string, followerCount: number): Promise<string[]> {
      const unlocked: string[] = []

      if (followerCount >= 5 && (await this.checkAndUnlock(playerId, 'social_butterfly'))) {
        unlocked.push('social_butterfly')
      }

      return unlocked
    },

    async checkClubMilestones(playerId: string, isCreator: boolean): Promise<string[]> {
      const unlocked: string[] = []

      if (await this.checkAndUnlock(playerId, 'community_member')) {
        unlocked.push('community_member')
      }
      if (isCreator && (await this.checkAndUnlock(playerId, 'club_founder'))) {
        unlocked.push('club_founder')
      }

      return unlocked
    },

    async checkTournamentMilestones(
      playerId: string,
      registrationCount: number
    ): Promise<string[]> {
      const unlocked: string[] = []

      if (registrationCount >= 1 && (await this.checkAndUnlock(playerId, 'tournament_debut'))) {
        unlocked.push('tournament_debut')
      }
      if (registrationCount >= 5 && (await this.checkAndUnlock(playerId, 'competitor'))) {
        unlocked.push('competitor')
      }

      return unlocked
    }
  }
}
