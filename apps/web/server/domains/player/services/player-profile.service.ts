import type { PlayerProfileRepository } from '../repositories/player-profile.repository'
import type { PlayerProfileDto, UpdatePlayerProfileInput } from '../dto/player-profile.dto'
import { toPlayerProfileDto } from '../dto/player-profile.dto'

export interface PlayerProfileService {
  getById(profileId: string): Promise<PlayerProfileDto | null>
  getOwnProfile(userId: string): Promise<PlayerProfileDto | null>
  saveOwnProfile(userId: string, input: UpdatePlayerProfileInput): Promise<PlayerProfileDto>
}

export function createPlayerProfileService(repository: PlayerProfileRepository): PlayerProfileService {
  return {
    async getById(profileId) {
      const profile = await repository.findById(profileId)
      return profile ? toPlayerProfileDto(profile) : null
    },

    async getOwnProfile(userId) {
      const profile = await repository.findByUserId(userId)
      return profile ? toPlayerProfileDto(profile) : null
    },

    async saveOwnProfile(userId, input) {
      const profile = await repository.upsertOwnProfile(userId, input)
      return toPlayerProfileDto(profile)
    }
  }
}
