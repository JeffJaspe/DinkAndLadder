import { describe, it, expect, vi } from 'vitest'
import { createAchievementEvaluator } from '../../server/domains/achievement/services/achievement-evaluator.service'
import { createAchievementGalleryService } from '../../server/domains/achievement/services/achievement-gallery.service'
import {
  ACHIEVEMENT_REQUIREMENTS,
  unmappedKeys
} from '../../server/domains/achievement/services/achievement-requirements'
import type { AchievementRepository } from '../../server/domains/achievement/repositories/achievement.repository'
import type {
  AchievementStatsRepository,
  PlayerAchievementStats
} from '../../server/domains/achievement/repositories/achievement-stats.repository'
import type {
  AchievementDefinitionRecord,
  PlayerAchievementWithDefinition
} from '../../server/domains/achievement/dto/achievement.dto'

function makeStats(overrides?: Partial<PlayerAchievementStats>): PlayerAchievementStats {
  return {
    matches_played: 0,
    matches_won: 0,
    best_rating: null,
    is_rated: false,
    followers: 0,
    clubs_joined: 0,
    created_a_club: false,
    tournament_registrations: 0,
    tournament_wins: 0,
    tournament_runner_ups: 0,
    ...overrides
  }
}

function makeDefinition(
  key: string,
  overrides?: Partial<AchievementDefinitionRecord>
): AchievementDefinitionRecord {
  return {
    id: `def-${key}`,
    key,
    category: 'milestone',
    tier: 'bronze',
    name: key,
    description: `Description for ${key}`,
    icon: '🎾',
    criteria: { type: 'count', entity: 'matches', threshold: 1 },
    points: 10,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function makeHeld(key: string, unlockedAt = '2026-01-02T00:00:00Z') {
  return {
    id: `pa-${key}`,
    player_id: 'player-1',
    achievement_id: `def-${key}`,
    unlocked_at: unlockedAt,
    claimed_at: null,
    progress: null,
    created_at: unlockedAt,
    achievement_definitions: makeDefinition(key)
  } as unknown as PlayerAchievementWithDefinition
}

function fakeRepos(definitions: AchievementDefinitionRecord[], held: string[] = []) {
  const achievements = {
    findAllDefinitions: vi.fn().mockResolvedValue(definitions),
    findDefinitionById: vi.fn().mockResolvedValue(null),
    findDefinitionByKey: vi.fn().mockResolvedValue(null),
    findPlayerAchievements: vi.fn().mockResolvedValue(held.map((k) => makeHeld(k))),
    findPlayerAchievement: vi.fn().mockResolvedValue(null),
    createPlayerAchievement: vi.fn().mockResolvedValue({}),
    claimAchievement: vi.fn(),
    countPlayerAchievementPoints: vi.fn().mockResolvedValue(0)
  } satisfies AchievementRepository
  return achievements
}

function fakeStats(stats: PlayerAchievementStats): AchievementStatsRepository {
  return { gather: vi.fn().mockResolvedValue(stats) }
}

describe('achievement requirements', () => {
  it('awards nothing on an empty record except the newcomer badge', () => {
    const stats = makeStats()
    const met = Object.entries(ACHIEVEMENT_REQUIREMENTS)
      .filter(([, rule]) => rule.met(stats))
      .map(([key]) => key)

    expect(met).toEqual(['newcomer'])
  })

  it('treats every rating milestone as a level, not a running total', () => {
    // A rating can fall. Showing "3.2 of 3.5" would read as four fifths done,
    // so these deliberately expose no progress.
    for (const key of ['rising_star', 'skilled_player', 'elite_player']) {
      expect(ACHIEVEMENT_REQUIREMENTS[key].progress).toBeUndefined()
    }
  })

  it('caps reported progress at the target', () => {
    const progress = ACHIEVEMENT_REQUIREMENTS.regular_player.progress!(
      makeStats({ matches_played: 40 })
    )
    expect(progress).toEqual({ current: 10, target: 10 })
  })

  it('unlocks match milestones at their exact thresholds', () => {
    expect(ACHIEVEMENT_REQUIREMENTS.regular_player.met(makeStats({ matches_played: 9 }))).toBe(
      false
    )
    expect(ACHIEVEMENT_REQUIREMENTS.regular_player.met(makeStats({ matches_played: 10 }))).toBe(
      true
    )
  })

  it('does not award a rating milestone to an unrated player', () => {
    expect(ACHIEVEMENT_REQUIREMENTS.rated_player.met(makeStats({ is_rated: false }))).toBe(false)
    expect(ACHIEVEMENT_REQUIREMENTS.rising_star.met(makeStats({ best_rating: null }))).toBe(false)
  })

  it('reports a seeded achievement that has no rule behind it', () => {
    expect(unmappedKeys(['first_match', 'invented_badge'])).toEqual(['invented_badge'])
    expect(unmappedKeys(Object.keys(ACHIEVEMENT_REQUIREMENTS))).toEqual([])
  })
})

describe('AchievementEvaluator', () => {
  it('awards only what the record supports', async () => {
    const definitions = [
      makeDefinition('first_match'),
      makeDefinition('regular_player'),
      makeDefinition('elite_player')
    ]
    const achievements = fakeRepos(definitions)
    const evaluator = createAchievementEvaluator(
      achievements,
      fakeStats(makeStats({ matches_played: 3 }))
    )

    const result = await evaluator.evaluate('player-1', 'user-1')

    expect(result.unlocked.map((a) => a.key)).toEqual(['first_match'])
    expect(achievements.createPlayerAchievement).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — a second run awards nothing', async () => {
    const definitions = [makeDefinition('first_match')]
    const achievements = fakeRepos(definitions, ['first_match'])
    const evaluator = createAchievementEvaluator(
      achievements,
      fakeStats(makeStats({ matches_played: 3 }))
    )

    const result = await evaluator.evaluate('player-1', 'user-1')

    expect(result.unlocked).toEqual([])
    expect(result.already_held).toBe(1)
    expect(achievements.createPlayerAchievement).not.toHaveBeenCalled()
  })

  it('treats a concurrent duplicate grant as success, not failure', async () => {
    // uq_player_achievement makes two matches settling at once a unique
    // violation rather than a duplicate row. The player holds it either way.
    const achievements = fakeRepos([makeDefinition('first_match')])
    achievements.createPlayerAchievement = vi.fn().mockRejectedValue({ code: '23505' })

    const evaluator = createAchievementEvaluator(
      achievements,
      fakeStats(makeStats({ matches_played: 1 }))
    )

    const result = await evaluator.evaluate('player-1', 'user-1')

    expect(result.unlocked).toEqual([])
  })

  it('propagates a real database failure rather than silently awarding nothing', async () => {
    const achievements = fakeRepos([makeDefinition('first_match')])
    achievements.createPlayerAchievement = vi.fn().mockRejectedValue({ code: '42501' })

    const evaluator = createAchievementEvaluator(
      achievements,
      fakeStats(makeStats({ matches_played: 1 }))
    )

    await expect(evaluator.evaluate('player-1', 'user-1')).rejects.toBeDefined()
  })

  it('never awards a definition with no rule behind it, and reports it', async () => {
    const achievements = fakeRepos([makeDefinition('invented_badge')])
    const evaluator = createAchievementEvaluator(
      achievements,
      fakeStats(makeStats({ matches_played: 500, matches_won: 500 }))
    )

    const result = await evaluator.evaluate('player-1', 'user-1')

    expect(result.unlocked).toEqual([])
    expect(result.unmapped).toEqual(['invented_badge'])
  })
})

describe('AchievementGalleryService', () => {
  it('marks locked entries with their requirement and progress', async () => {
    const definitions = [makeDefinition('first_match'), makeDefinition('regular_player')]
    const gallery = createAchievementGalleryService(
      fakeRepos(definitions, ['first_match']),
      fakeStats(makeStats({ matches_played: 4 }))
    )

    const result = await gallery.forPlayer('player-1', 'user-1')

    const earned = result.entries.find((e) => e.key === 'first_match')!
    expect(earned.earned).toBe(true)
    expect(earned.hint).toBeNull()
    expect(earned.progress).toBeNull()

    const locked = result.entries.find((e) => e.key === 'regular_player')!
    expect(locked.earned).toBe(false)
    expect(locked.hint).toBe('Play 10 recorded matches')
    expect(locked.progress).toEqual({ current: 4, target: 10 })
    expect(locked.pending).toBe(false)
  })

  it('flags a locked badge whose requirement is already met as pending', async () => {
    // Reachable today: achievements are awarded from here forward with no
    // backfill, so a long-standing player's record can satisfy a badge before
    // anything has re-run the evaluator for them. A full progress bar under a
    // padlock reads as a broken page, so the gallery names the state instead.
    const gallery = createAchievementGalleryService(
      fakeRepos([makeDefinition('regular_player')]),
      fakeStats(makeStats({ matches_played: 40 }))
    )

    const entry = (await gallery.forPlayer('player-1', 'user-1')).entries[0]

    expect(entry.earned).toBe(false)
    expect(entry.pending).toBe(true)
  })

  it('never marks an earned badge pending', async () => {
    const gallery = createAchievementGalleryService(
      fakeRepos([makeDefinition('first_match')], ['first_match']),
      fakeStats(makeStats({ matches_played: 40 }))
    )

    expect((await gallery.forPlayer('player-1', 'user-1')).entries[0].pending).toBe(false)
  })

  it('counts points earned and points still available separately', async () => {
    const definitions = [
      makeDefinition('first_match', { points: 10 }),
      makeDefinition('regular_player', { points: 25 }),
      makeDefinition('match_master', { points: 100 })
    ]
    const gallery = createAchievementGalleryService(
      fakeRepos(definitions, ['first_match']),
      fakeStats(makeStats({ matches_played: 4 }))
    )

    const result = await gallery.forPlayer('player-1', 'user-1')

    expect(result.earned_count).toBe(1)
    expect(result.total_count).toBe(3)
    expect(result.total_points).toBe(10)
    expect(result.points_remaining).toBe(125)
  })

  it('states plainly when a definition has no rule instead of inventing one', async () => {
    const gallery = createAchievementGalleryService(
      fakeRepos([makeDefinition('invented_badge')]),
      fakeStats(makeStats())
    )

    const result = await gallery.forPlayer('player-1', 'user-1')

    expect(result.entries[0].hint).toBe('Not available yet')
    expect(result.entries[0].progress).toBeNull()
  })

  it('orders the gallery as a ladder rather than by category', async () => {
    const definitions = [
      makeDefinition('match_master', { tier: 'platinum', points: 100 }),
      makeDefinition('first_match', { tier: 'bronze', points: 10 }),
      makeDefinition('dedicated_player', { tier: 'gold', points: 50 }),
      makeDefinition('regular_player', { tier: 'silver', points: 25 })
    ]
    const gallery = createAchievementGalleryService(fakeRepos(definitions), fakeStats(makeStats()))

    const result = await gallery.forPlayer('player-1', 'user-1')

    expect(result.entries.map((e) => e.tier)).toEqual(['bronze', 'silver', 'gold', 'platinum'])
  })
})
