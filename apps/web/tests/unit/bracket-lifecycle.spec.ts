import { describe, expect, it, vi } from 'vitest'
import { createBracketService } from '../../server/domains/event/services/bracket.service'
import type { BracketRepository } from '../../server/domains/event/repositories/bracket.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { TournamentCategoryRepository } from '../../server/domains/event/repositories/tournament-category.repository'

/**
 * The lifecycle a draw now has:
 *
 *     open -> generate -> lock -> complete
 *             (private,   (public,
 *              redrawable) playable)
 *
 * Before this, generation was destructive, repeatable, immediately public, and
 * had no undo — an organiser trying three seedings broadcast all three to every
 * entrant, and a mis-click could not be taken back.
 */

const ORGANISER = 'player-organiser'
const STRANGER = 'player-stranger'

function unlockedCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    tournament_id: 'tournament-1',
    match_type: null,
    format: null,
    max_participants: null,
    bracket_locked_at: null,
    ...overrides
  }
}

function repos(
  overrides: {
    bracket?: Partial<BracketRepository>
    tournament?: Partial<TournamentRepository>
    category?: Partial<TournamentCategoryRepository>
    registrations?: Partial<TournamentRegistrationRepository>
  } = {}
) {
  const bracket = {
    findById: vi.fn().mockResolvedValue(null),
    findByTournamentId: vi.fn().mockResolvedValue([{ id: 'bm-1' }]),
    createMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    setParticipant: vi.fn(),
    deleteByTournamentId: vi.fn().mockResolvedValue(undefined),
    countRecordedResults: vi.fn().mockResolvedValue(0),
    ...overrides.bracket
  } as unknown as BracketRepository

  const tournament = {
    findById: vi.fn().mockResolvedValue({
      id: 'tournament-1',
      event_id: 'event-1',
      name: 'Open',
      format: 'single_elimination',
      match_type: 'singles',
      min_rating: null,
      max_rating: null,
      max_participants: null,
      status: 'open',
      bracket_locked_at: null,
      bracket_locked_by_player_id: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z'
    }),
    findByEventId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    setBracketLock: vi.fn().mockResolvedValue(null),
    ...overrides.tournament
  } as unknown as TournamentRepository

  const category = {
    findById: vi.fn().mockResolvedValue(unlockedCategory()),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    listTemplates: vi.fn().mockResolvedValue([]),
    countRecordedResults: vi.fn().mockResolvedValue(0),
    countUndecidedMatches: vi.fn().mockResolvedValue(0),
    deleteWithChildren: vi.fn(),
    setBracketLock: vi.fn().mockResolvedValue(null),
    ...overrides.category
  } as unknown as TournamentCategoryRepository

  const registrations = {
    findById: vi.fn().mockResolvedValue(null),
    findCategoryEntrants: vi.fn().mockResolvedValue([]),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    findByTournamentIdWithPlayers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateStatus: vi.fn(),
    countByTournament: vi.fn().mockResolvedValue(0),
    ...overrides.registrations
  } as unknown as TournamentRegistrationRepository

  const events = {
    findById: vi.fn().mockResolvedValue({
      id: 'event-1',
      created_by_player_id: ORGANISER,
      status: 'published'
    }),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    countBlockingChildren: vi.fn(),
    deleteWithChildren: vi.fn()
  } as unknown as EventRepository

  return {
    bracket,
    tournament,
    category,
    registrations,
    events,
    service: createBracketService(bracket, tournament, registrations, events, undefined, category)
  }
}

/** Confirmed entrants, joined-row shaped. */
function entrants(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `reg-${i + 1}`,
    tournament_id: 'tournament-1',
    player_id: `player-${i + 1}`,
    partner_player_id: null,
    status: 'confirmed' as const,
    registered_at: '2026-08-01T00:00:00Z',
    confirmed_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    category_id: 'cat-1',
    display_name: `Player ${i + 1}`,
    singles_rating: null,
    doubles_rating: null,
    partner_display_name: null
  }))
}

function slot(id: string, categoryId: string | null, position: number) {
  return {
    id,
    tournament_id: 'tournament-1',
    round: 1,
    position,
    category_id: categoryId,
    match_id: null,
    participant1_registration_id: null,
    participant2_registration_id: null,
    winner_registration_id: null,
    status: 'pending' as const,
    scheduled_at: null,
    created_at: '2026-08-01T00:00:00Z'
  }
}

describe('draw visibility before it is locked', () => {
  it('hides an unlocked draw from a player', async () => {
    const { service } = repos()
    const result = await service.getBracket('tournament-1', 'cat-1', STRANGER)

    expect(result.locked).toBe(false)
    // Not an error and not a 403: the card falls back to the placeholder shape
    // and the entrant list, which is what a player actually needs before a draw
    // is final.
    expect(result.rounds).toEqual([])
  })

  it('shows the organiser their own working copy', async () => {
    const { service } = repos({
      bracket: { findByTournamentId: vi.fn().mockResolvedValue([slot('bm-1', 'cat-1', 1)]) }
    })
    const result = await service.getBracket('tournament-1', 'cat-1', ORGANISER)

    expect(result.locked).toBe(false)
    expect(result.rounds).toHaveLength(1)
  })

  it('shows a locked draw to everyone', async () => {
    const { service } = repos({
      category: {
        findById: vi
          .fn()
          .mockResolvedValue(unlockedCategory({ bracket_locked_at: '2026-08-10T09:00:00Z' }))
      },
      bracket: { findByTournamentId: vi.fn().mockResolvedValue([slot('bm-1', 'cat-1', 1)]) }
    })
    const result = await service.getBracket('tournament-1', 'cat-1', STRANGER)

    expect(result.locked).toBe(true)
    expect(result.rounds).toHaveLength(1)
  })

  /**
   * The page fetches one bracket for the whole tournament rather than one per
   * card. A single yes/no gate on that read would either leak every unlocked
   * draw or hide every locked one, so each match is judged by its own category.
   */
  it('filters the combined read per category, not all-or-nothing', async () => {
    const { service } = repos({
      category: {
        findByTournamentId: vi.fn().mockResolvedValue([
          { id: 'cat-locked', bracket_locked_at: '2026-08-10T09:00:00Z' },
          { id: 'cat-open', bracket_locked_at: null }
        ])
      },
      bracket: {
        findByTournamentId: vi
          .fn()
          .mockResolvedValue([slot('bm-1', 'cat-locked', 1), slot('bm-2', 'cat-open', 2)])
      }
    })

    const result = await service.getBracket('tournament-1', undefined, STRANGER)
    const ids = result.rounds.flatMap((r) => r.matches.map((m) => m.id))

    expect(ids).toEqual(['bm-1'])
  })
})

describe('generate refuses a half-full category', () => {
  function fullnessCase(capacity: number | null, confirmed: number) {
    return repos({
      category: {
        findById: vi.fn().mockResolvedValue(unlockedCategory({ max_participants: capacity }))
      },
      registrations: {
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(entrants(confirmed))
      }
    })
  }

  it('refuses when the category has fewer entries than its size', async () => {
    const { service } = fullnessCase(8, 6)

    await expect(service.generateBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toMatchObject(
      { code: 'CATEGORY_NOT_FULL' }
    )
  })

  it('names the way out — lower the size — rather than only refusing', async () => {
    const { service } = fullnessCase(8, 6)

    await expect(service.generateBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toThrow(
      /lower the size in Settings/
    )
  })

  it('draws a category that is exactly full', async () => {
    const { service, bracket } = fullnessCase(4, 4)

    await service.generateBracket(ORGANISER, 'tournament-1', 'cat-1')
    expect(bracket.createMany).toHaveBeenCalled()
  })

  it('keeps the old two-entrant rule for a category with no stated size', async () => {
    const { service, bracket } = fullnessCase(null, 3)

    await service.generateBracket(ORGANISER, 'tournament-1', 'cat-1')
    expect(bracket.createMany).toHaveBeenCalled()
  })

  it('refuses to redraw a locked category', async () => {
    const { service } = repos({
      category: {
        findById: vi
          .fn()
          .mockResolvedValue(unlockedCategory({ bracket_locked_at: '2026-08-10T09:00:00Z' }))
      },
      registrations: { findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(entrants(4)) }
    })

    await expect(service.generateBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toMatchObject(
      { code: 'BRACKET_LOCKED' }
    )
  })
})

describe('undo and lock', () => {
  it('undo deletes only this category draw', async () => {
    const { service, bracket } = repos()
    await service.undoBracket(ORGANISER, 'tournament-1', 'cat-1')

    expect(bracket.deleteByTournamentId).toHaveBeenCalledWith('tournament-1', 'cat-1')
  })

  it('refuses undo once a result has been recorded', async () => {
    // The bracket rows would go, but the `matches` they point at carry verified
    // results that have already moved ratings.
    const { service, bracket } = repos({
      bracket: { countRecordedResults: vi.fn().mockResolvedValue(2) }
    })

    await expect(service.undoBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toMatchObject({
      code: 'RESULTS_RECORDED'
    })
    expect(bracket.deleteByTournamentId).not.toHaveBeenCalled()
  })

  it('refuses undo on a locked draw', async () => {
    const { service } = repos({
      category: {
        findById: vi
          .fn()
          .mockResolvedValue(unlockedCategory({ bracket_locked_at: '2026-08-10T09:00:00Z' }))
      }
    })

    await expect(service.undoBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toMatchObject({
      code: 'BRACKET_LOCKED'
    })
  })

  it('refuses undo to anyone but the organiser', async () => {
    const { service } = repos()
    await expect(service.undoBracket(STRANGER, 'tournament-1', 'cat-1')).rejects.toMatchObject({
      status: 403
    })
  })

  it('locks a drawn category, stamping who did it', async () => {
    const { service, category } = repos()
    await service.lockBracket(ORGANISER, 'tournament-1', 'cat-1')

    expect(category.setBracketLock).toHaveBeenCalledWith('cat-1', ORGANISER)
  })

  it('refuses to lock a category with no draw', async () => {
    // Locking an empty draw would tell players it is final while showing them
    // nothing.
    const { service } = repos({ bracket: { findByTournamentId: vi.fn().mockResolvedValue([]) } })

    await expect(service.lockBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toMatchObject({
      code: 'NO_BRACKET'
    })
  })

  it('unlock clears the lock', async () => {
    const { service, category } = repos()
    await service.unlockBracket(ORGANISER, 'tournament-1', 'cat-1')

    expect(category.setBracketLock).toHaveBeenCalledWith('cat-1', null)
  })

  it('refuses to unlock once a result exists', async () => {
    const { service, category } = repos({
      bracket: { countRecordedResults: vi.fn().mockResolvedValue(1) }
    })

    await expect(service.unlockBracket(ORGANISER, 'tournament-1', 'cat-1')).rejects.toMatchObject({
      code: 'RESULTS_RECORDED'
    })
    expect(category.setBracketLock).not.toHaveBeenCalled()
  })

  it('falls back to the tournament for a category-less draw', async () => {
    const { service, tournament } = repos()
    await service.lockBracket(ORGANISER, 'tournament-1')

    expect(tournament.setBracketLock).toHaveBeenCalledWith('tournament-1', ORGANISER)
  })
})
