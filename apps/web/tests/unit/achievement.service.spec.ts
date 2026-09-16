import { describe, it, expect, vi } from 'vitest'
import {
  createAchievementService,
  AchievementServiceError
} from '../../server/domains/achievement/services/achievement.service'
import type { AchievementRepository } from '../../server/domains/achievement/repositories/achievement.repository'
import type {
  AchievementDefinitionRecord,
  PlayerAchievementRecord,
  PlayerAchievementWithDefinition
} from '../../server/domains/achievement/dto/achievement.dto'

function createFakeRepository(overrides?: Partial<AchievementRepository>): AchievementRepository {
  return {
    findAllDefinitions: vi.fn().mockResolvedValue([]),
    findDefinitionById: vi.fn().mockResolvedValue(null),
    findDefinitionByKey: vi.fn().mockResolvedValue(null),
    findPlayerAchievements: vi.fn().mockResolvedValue([]),
    findPlayerAchievement: vi.fn().mockResolvedValue(null),
    createPlayerAchievement: vi.fn(),
    claimAchievement: vi.fn(),
    countPlayerAchievementPoints: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}

function makeDefinitionRecord(
  overrides?: Partial<AchievementDefinitionRecord>
): AchievementDefinitionRecord {
  return {
    id: 'achievement-1',
    key: 'first_match',
    category: 'milestone',
    tier: 'bronze',
    name: 'First Match',
    description: 'Complete your first match',
    icon: '🎾',
    criteria: { type: 'count', entity: 'matches', threshold: 1 },
    points: 10,
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function makePlayerAchievementRecord(
  overrides?: Partial<PlayerAchievementRecord>
): PlayerAchievementRecord {
  return {
    id: 'player-achievement-1',
    player_id: 'player-1',
    achievement_id: 'achievement-1',
    unlocked_at: '2026-08-01T00:00:00Z',
    claimed_at: null,
    progress: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

describe('AchievementService', () => {
  describe('getAllDefinitions', () => {
    it('returns all active definitions', async () => {
      const definitions = [
        makeDefinitionRecord(),
        makeDefinitionRecord({ id: 'achievement-2', key: 'winner' })
      ]
      const repo = createFakeRepository({
        findAllDefinitions: vi.fn().mockResolvedValue(definitions)
      })
      const service = createAchievementService(repo)

      const result = await service.getAllDefinitions()

      expect(result).toHaveLength(2)
    })
  })

  describe('getPlayerAchievements', () => {
    it('returns player achievements with definitions', async () => {
      const definition = makeDefinitionRecord()
      const withDef: PlayerAchievementWithDefinition = {
        ...makePlayerAchievementRecord(),
        achievement_definitions: definition
      }
      const repo = createFakeRepository({
        findPlayerAchievements: vi.fn().mockResolvedValue([withDef])
      })
      const service = createAchievementService(repo)

      const result = await service.getPlayerAchievements('player-1')

      expect(result).toHaveLength(1)
      expect(result[0].achievement.name).toBe('First Match')
    })
  })

  describe('claimAchievement', () => {
    it('claims an unclaimed achievement', async () => {
      const definition = makeDefinitionRecord()
      const existing = makePlayerAchievementRecord()
      const claimed = { ...existing, claimed_at: '2026-08-01T12:00:00Z' }

      const repo = createFakeRepository({
        findPlayerAchievement: vi.fn().mockResolvedValue(existing),
        claimAchievement: vi.fn().mockResolvedValue(claimed),
        findDefinitionById: vi.fn().mockResolvedValue(definition)
      })
      const service = createAchievementService(repo)

      const result = await service.claimAchievement('player-1', 'achievement-1')

      expect(result.claimed_at).toBe('2026-08-01T12:00:00Z')
    })

    it('throws when achievement not unlocked', async () => {
      const repo = createFakeRepository()
      const service = createAchievementService(repo)

      await expect(service.claimAchievement('player-1', 'achievement-1')).rejects.toThrow(
        AchievementServiceError
      )
    })

    it('throws when already claimed', async () => {
      const existing = makePlayerAchievementRecord({ claimed_at: '2026-08-01T10:00:00Z' })
      const repo = createFakeRepository({
        findPlayerAchievement: vi.fn().mockResolvedValue(existing)
      })
      const service = createAchievementService(repo)

      await expect(service.claimAchievement('player-1', 'achievement-1')).rejects.toThrow(
        AchievementServiceError
      )
    })
  })

  describe('getPlayerPoints', () => {
    it('returns total points', async () => {
      const repo = createFakeRepository({
        countPlayerAchievementPoints: vi.fn().mockResolvedValue(85)
      })
      const service = createAchievementService(repo)

      const result = await service.getPlayerPoints('player-1')

      expect(result).toBe(85)
    })
  })
})
