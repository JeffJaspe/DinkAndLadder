import { describe, expect, it, vi } from 'vitest'
import { createBracketService } from '../../server/domains/event/services/bracket.service'
import type { BracketRepository } from '../../server/domains/event/repositories/bracket.repository'
import type {
  TournamentRepository,
  TournamentRegistrationRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { TournamentCategoryRepository } from '../../server/domains/event/repositories/tournament-category.repository'

/**
 * `attachRatings` reads the categories once for a whole bracket.
 *
 * Its docblock said so all along — "this stays two queries for a whole bracket
 * however many categories it holds" — while the code looped the distinct
 * category ids and awaited `findById` for each in turn, so an eight-draw
 * tournament paid eight serial round trips on every bracket load. A comment
 * cannot fail; this can.
 */

function makeCategory(id: string) {
  return {
    id,
    tournament_id: 'tournament-1',
    name: `Category ${id}`,
    match_type: 'doubles' as const,
    bracket_locked_at: '2026-01-01T00:00:00Z'
  }
}

function setup(categoryIds: string[]) {
  const findById = vi.fn(async (id: string) => makeCategory(id))
  const findByTournamentId = vi.fn(async () => categoryIds.map(makeCategory))

  const categories = {
    findById,
    findByTournamentId
  } as unknown as TournamentCategoryRepository

  const tournaments = {
    async findById() {
      return {
        id: 'tournament-1',
        event_id: 'event-1',
        name: 'Summer Open',
        format: 'single_elimination',
        match_type: 'doubles',
        status: 'open',
        bracket_locked_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z'
      }
    }
  } as unknown as TournamentRepository

  // One entrant per category, which is what used to mean one query per entrant.
  const registrations = {
    async findByTournamentIdWithPlayers() {
      return categoryIds.map((categoryId, i) => ({
        id: `reg-${i}`,
        tournament_id: 'tournament-1',
        category_id: categoryId,
        player_id: `player-${i}`,
        partner_player_id: null,
        status: 'confirmed',
        display_name: `Player ${i}`,
        singles_rating: 3.0,
        doubles_rating: 4.0,
        created_at: '2026-01-01T00:00:00Z'
      }))
    }
  } as unknown as TournamentRegistrationRepository

  const brackets = {
    async findByTournamentId() {
      return []
    }
  } as unknown as BracketRepository

  const events = {
    async findById() {
      return { id: 'event-1', created_by_player_id: 'organiser-1' }
    }
  } as unknown as EventRepository

  return {
    service: createBracketService(
      brackets,
      tournaments,
      registrations,
      events,
      undefined,
      categories
    ),
    findById,
    findByTournamentId
  }
}

describe('BracketService category reads', () => {
  it('never reads a category one at a time', async () => {
    const { service, findById, findByTournamentId } = setup(['cat-a', 'cat-b', 'cat-c', 'cat-d'])

    await service.getBracket('tournament-1')

    expect(findById).not.toHaveBeenCalled()
    expect(findByTournamentId).toHaveBeenCalledWith('tournament-1')
  })

  /**
   * The assertion that actually catches a regression to the loop. Doubling the
   * categories must not change the number of queries — a per-category
   * `findById` would double with them.
   */
  it('costs the same number of reads however many categories there are', async () => {
    const four = setup(['cat-a', 'cat-b', 'cat-c', 'cat-d'])
    await four.service.getBracket('tournament-1')

    const eight = setup(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    await eight.service.getBracket('tournament-1')

    expect(eight.findByTournamentId.mock.calls.length).toBe(
      four.findByTournamentId.mock.calls.length
    )
    expect(eight.findById).not.toHaveBeenCalled()
  })
})
