import { describe, it, expect, vi } from 'vitest'
import {
  createAchievementService,
  createAchievementUnlocker,
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

describe('AchievementUnlocker', () => {
  describe('checkAndUnlock', () => {
    it('unlocks an achievement', async () => {
      const definition = makeDefinitionRecord()
      const newAchievement = makePlayerAchievementRecord()

      const repo = createFakeRepository({
        findDefinitionByKey: vi.fn().mockResolvedValue(definition),
        findPlayerAchievement: vi.fn().mockResolvedValue(null),
        createPlayerAchievement: vi.fn().mockResolvedValue(newAchievement)
      })
      const unlocker = createAchievementUnlocker(repo)

      const result = await unlocker.checkAndUnlock('player-1', 'first_match')

      expect(result).toBe(true)
      expect(repo.createPlayerAchievement).toHaveBeenCalledWith('player-1', 'achievement-1')
    })

    it('returns false if already unlocked', async () => {
      const definition = makeDefinitionRecord()
      const existing = makePlayerAchievementRecord()

      const repo = createFakeRepository({
        findDefinitionByKey: vi.fn().mockResolvedValue(definition),
        findPlayerAchievement: vi.fn().mockResolvedValue(existing)
      })
      const unlocker = createAchievementUnlocker(repo)

      const result = await unlocker.checkAndUnlock('player-1', 'first_match')

      expect(result).toBe(false)
    })

    it('returns false if definition not found', async () => {
      const repo = createFakeRepository()
      const unlocker = createAchievementUnlocker(repo)

      const result = await unlocker.checkAndUnlock('player-1', 'nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('checkMatchMilestones', () => {
    it('unlocks first_match at 1 match', async () => {
      const definition = makeDefinitionRecord()
      const repo = createFakeRepository({
        findDefinitionByKey: vi.fn().mockResolvedValue(definition),
        findPlayerAchievement: vi.fn().mockResolvedValue(null),
        createPlayerAchievement: vi.fn().mockResolvedValue(makePlayerAchievementRecord())
      })
      const unlocker = createAchievementUnlocker(repo)

      const result = await unlocker.checkMatchMilestones('player-1', 1)

      expect(result).toContain('first_match')
    })
  })

  describe('checkRatingMilestones', () => {
    it('unlocks rated_player when rated', async () => {
      const definition = makeDefinitionRecord({ key: 'rated_player' })
      const repo = createFakeRepository({
        findDefinitionByKey: vi.fn().mockResolvedValue(definition),
        findPlayerAchievement: vi.fn().mockResolvedValue(null),
        createPlayerAchievement: vi.fn().mockResolvedValue(makePlayerAchievementRecord())
      })
      const unlocker = createAchievementUnlocker(repo)

      const result = await unlocker.checkRatingMilestones('player-1', 3.0)

      expect(result).toContain('rated_player')
    })
  })
})
