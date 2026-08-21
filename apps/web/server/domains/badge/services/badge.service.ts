import type { BadgeRepository } from '../repositories/badge.repository'
import type { BadgeShowcaseDto } from '../dto/badge.dto'
import { badgeShowcaseRecordToDto, AVAILABLE_BADGES, getBadgeById } from '../dto/badge.dto'

export interface BadgeService {
  getShowcase(playerId: string): Promise<BadgeShowcaseDto | null>
  setSelectedBadge(playerId: string, badgeId: string | null): Promise<BadgeShowcaseDto>
  getAvailableBadges(): typeof AVAILABLE_BADGES
}

export function createBadgeService(badgeRepository: BadgeRepository): BadgeService {
  return {
    async getShowcase(playerId: string): Promise<BadgeShowcaseDto | null> {
      const record = await badgeRepository.findByPlayerId(playerId)
      return record ? badgeShowcaseRecordToDto(record) : null
    },

    async setSelectedBadge(playerId: string, badgeId: string | null): Promise<BadgeShowcaseDto> {
      if (badgeId !== null && !getBadgeById(badgeId)) {
        throw new Error(`Invalid badge ID: ${badgeId}`)
      }
      const record = await badgeRepository.upsert(playerId, badgeId)
      return badgeShowcaseRecordToDto(record)
    },

    getAvailableBadges() {
      return AVAILABLE_BADGES
    }
  }
}
