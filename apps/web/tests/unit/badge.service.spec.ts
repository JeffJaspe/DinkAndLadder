import { describe, it, expect, vi } from 'vitest'
import {
  createBadgeService,
  BadgeServiceError
} from '../../server/domains/badge/services/badge.service'
import type { BadgeRepository } from '../../server/domains/badge/repositories/badge.repository'
import type { AchievementRepository } from '../../server/domains/achievement/repositories/achievement.repository'
import type { PlayerAchievementWithDefinition } from '../../server/domains/achievement/dto/achievement.dto'

function heldAchievement(
  key: string,
  overrides?: { is_active?: boolean }
): PlayerAchievementWithDefinition {
  return {
    id: `pa-${key}`,
    player_id: 'player-1',
    achievement_id: `def-${key}`,
    unlocked_at: '2026-02-01T00:00:00Z',
    claimed_at: null,
    progress: null,
    created_at: '2026-02-01T00:00:00Z',
    achievement_definitions: {
      id: `def-${key}`,
      key,
      category: 'milestone',
      tier: 'gold',
      name: `Name of ${key}`,
      description: `Description of ${key}`,
      icon: '🏆',
      criteria: { type: 'count', entity: 'matches', threshold: 1 },
      points: 50,
      is_active: overrides?.is_active ?? true,
      created_at: '2026-01-01T00:00:00Z'
    }
  } as unknown as PlayerAchievementWithDefinition
}

function fakeAchievements(held: PlayerAchievementWithDefinition[]): AchievementRepository {
  return {
    findAllDefinitions: vi.fn().mockResolvedValue([]),
    findDefinitionById: vi.fn().mockResolvedValue(null),
    findDefinitionByKey: vi.fn().mockResolvedValue(null),
    findPlayerAchievements: vi.fn().mockResolvedValue(held),
    findPlayerAchievement: vi.fn().mockResolvedValue(null),
    createPlayerAchievement: vi.fn(),
    claimAchievement: vi.fn(),
    countPlayerAchievementPoints: vi.fn().mockResolvedValue(0)
  }
}

function fakeBadgeRepo(selected: string | null): BadgeRepository {
  return {
    findByPlayerId: vi.fn().mockResolvedValue({
      player_id: 'player-1',
      selected_badge_id: selected,
      updated_at: '2026-02-02T00:00:00Z'
    }),
    upsert: vi.fn().mockImplementation((playerId: string, badgeId: string | null) =>
      Promise.resolve({
        player_id: playerId,
        selected_badge_id: badgeId,
        updated_at: '2026-02-03T00:00:00Z'
      })
    )
  }
}

describe('BadgeService', () => {
  it('refuses to show a badge the player has not earned', async () => {
    // The whole point of the change. The previous implementation validated the
    // id against a hard-coded list and nothing else, so anyone who could send
    // a PUT could wear "Tournament Champion".
    const repo = fakeBadgeRepo(null)
    const service = createBadgeService(repo, fakeAchievements([heldAchievement('first_match')]))

    await expect(service.setSelectedBadge('player-1', 'tournament_winner')).rejects.toThrow(
      BadgeServiceError
    )
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('shows a badge the player has earned', async () => {
    const repo = fakeBadgeRepo(null)
    const service = createBadgeService(repo, fakeAchievements([heldAchievement('first_match')]))

    const result = await service.setSelectedBadge('player-1', 'first_match')

    expect(result.selectedBadgeId).toBe('first_match')
    expect(repo.upsert).toHaveBeenCalledWith('player-1', 'first_match')
  })

  it('always allows clearing the badge', async () => {
    const repo = fakeBadgeRepo('first_match')
    const service = createBadgeService(repo, fakeAchievements([]))

    const result = await service.setSelectedBadge('player-1', null)

    expect(result.selectedBadgeId).toBeNull()
  })

  it('does not render a stored badge the player no longer holds', async () => {
    // 065 clears the self-assigned selections, but a selection can also outlive
    // its achievement being deactivated. The profile shows nothing rather than
    // a badge the record does not support.
    const service = createBadgeService(fakeBadgeRepo('tournament_winner'), fakeAchievements([]))

    expect(await service.getSelectedBadge('player-1')).toBeNull()
  })

  it('hides badges whose achievement has been retired', async () => {
    const service = createBadgeService(
      fakeBadgeRepo('tournament_third'),
      fakeAchievements([heldAchievement('tournament_third', { is_active: false })])
    )

    expect(await service.getEarnedBadges('player-1')).toEqual([])
    expect(await service.getSelectedBadge('player-1')).toBeNull()
  })

  it('reports earned badges with the date they were earned', async () => {
    const service = createBadgeService(
      fakeBadgeRepo(null),
      fakeAchievements([heldAchievement('club_founder')])
    )

    const badges = await service.getEarnedBadges('player-1')

    expect(badges).toEqual([
      {
        id: 'club_founder',
        name: 'Name of club_founder',
        icon: '🏆',
        description: 'Description of club_founder',
        tier: 'gold',
        earnedAt: '2026-02-01T00:00:00Z'
      }
    ])
  })
})
