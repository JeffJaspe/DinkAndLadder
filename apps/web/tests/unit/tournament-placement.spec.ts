import { describe, it, expect } from 'vitest'
import { createTournamentPlacementRepository } from '../../server/domains/achievement/repositories/tournament-placement.repository'
import { createChampionshipService } from '../../server/domains/achievement/services/championship.service'
import type { SupabaseClient } from '@supabase/supabase-js'

interface BracketRow {
  tournament_id: string
  category_id: string | null
  round: number
  status: string
  winner_registration_id: string | null
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  scheduled_at: string | null
  matches: { played_at: string | null } | null
  tournaments: {
    name: string | null
    event_id: string | null
    events: { name: string | null } | null
  } | null
  tournament_categories: { name: string | null } | null
}

function row(overrides: Partial<BracketRow> & Pick<BracketRow, 'round'>): BracketRow {
  return {
    tournament_id: 't1',
    category_id: null,
    status: 'completed',
    winner_registration_id: null,
    participant1_registration_id: null,
    participant2_registration_id: null,
    scheduled_at: '2026-05-01T00:00:00Z',
    matches: null,
    tournaments: { name: 'Summer Slam', event_id: 'e1', events: { name: 'Summer Slam' } },
    tournament_categories: { name: null },
    ...overrides
  }
}

/**
 * The narrowest possible stand-in for the PostgREST builder these two use:
 * one `bracket_matches` read bounded by `.in('tournament_id', …)`, and the
 * `tournament_registrations` lookup the championship service does first.
 */
function fakeClient(
  rows: BracketRow[],
  registrations?: { id: string; tournament_id: string }[]
): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'tournament_registrations') {
        const result = Promise.resolve({ data: registrations ?? [], error: null })
        const builder = {
          select: () => builder,
          or: () => builder,
          neq: () => result,
          then: result.then.bind(result)
        }
        return builder
      }

      const builder = {
        select: () => builder,
        in: () => Promise.resolve({ data: rows, error: null })
      }
      return builder
    }
  } as unknown as SupabaseClient
}

describe('TournamentPlacementRepository', () => {
  it('finds the champion of a single-category draw', async () => {
    const rows = [
      row({
        round: 1,
        winner_registration_id: 'r1',
        participant1_registration_id: 'r1',
        participant2_registration_id: 'r9'
      }),
      row({
        round: 2,
        winner_registration_id: 'r1',
        participant1_registration_id: 'r1',
        participant2_registration_id: 'r8'
      })
    ]
    const placements = await createTournamentPlacementRepository(
      fakeClient(rows)
    ).findByRegistrations([{ id: 'r1', tournament_id: 't1' }])

    expect(placements).toHaveLength(1)
    expect(placements[0].placement).toBe(1)
  })

  it('reads the last round per category, not per tournament', async () => {
    // The bug this replaced: one tournament, two categories in one bracket
    // table. The 4-entry category's final is round 2; the 16-entry one's is
    // round 4. Taking the tournament's max round disqualified the champion of
    // the smaller draw entirely.
    const rows = [
      // Small category — its final IS round 2.
      row({
        category_id: 'cat-small',
        round: 2,
        winner_registration_id: 'r1',
        participant1_registration_id: 'r1',
        participant2_registration_id: 'r2',
        tournament_categories: { name: '3.0 Doubles' }
      }),
      // Large category, running to round 4 alongside it.
      row({ category_id: 'cat-big', round: 3, winner_registration_id: 'r7' }),
      row({ category_id: 'cat-big', round: 4, winner_registration_id: 'r7' })
    ]

    const placements = await createTournamentPlacementRepository(
      fakeClient(rows)
    ).findByRegistrations([{ id: 'r1', tournament_id: 't1' }])

    expect(placements).toHaveLength(1)
    expect(placements[0].placement).toBe(1)
    expect(placements[0].category_name).toBe('3.0 Doubles')
  })

  it('does not promote a semi-finalist of the largest category', async () => {
    const rows = [
      row({
        category_id: 'cat-big',
        round: 3,
        winner_registration_id: 'r7',
        participant1_registration_id: 'r7',
        participant2_registration_id: 'r1'
      }),
      row({ category_id: 'cat-big', round: 4, winner_registration_id: 'r7' })
    ]

    const placements = await createTournamentPlacementRepository(
      fakeClient(rows)
    ).findByRegistrations([{ id: 'r1', tournament_id: 't1' }])

    expect(placements).toEqual([])
  })

  it('records the losing finalist as second, not as nothing', async () => {
    const rows = [
      row({
        round: 2,
        winner_registration_id: 'r9',
        participant1_registration_id: 'r9',
        participant2_registration_id: 'r1'
      })
    ]

    const placements = await createTournamentPlacementRepository(
      fakeClient(rows)
    ).findByRegistrations([{ id: 'r1', tournament_id: 't1' }])

    expect(placements).toHaveLength(1)
    expect(placements[0].placement).toBe(2)
  })

  it('ignores a final that has not been played yet', async () => {
    const rows = [
      row({
        round: 2,
        status: 'pending',
        winner_registration_id: null,
        participant1_registration_id: 'r1'
      })
    ]

    expect(
      await createTournamentPlacementRepository(fakeClient(rows)).findByRegistrations([
        { id: 'r1', tournament_id: 't1' }
      ])
    ).toEqual([])
  })

  it('orders titles most recent first, undated last', async () => {
    const rows = [
      row({
        tournament_id: 't1',
        category_id: 'a',
        round: 1,
        winner_registration_id: 'r1',
        matches: { played_at: '2026-01-01T00:00:00Z' }
      }),
      row({
        tournament_id: 't1',
        category_id: 'b',
        round: 1,
        winner_registration_id: 'r1',
        matches: { played_at: '2026-06-01T00:00:00Z' }
      }),
      row({
        tournament_id: 't1',
        category_id: 'c',
        round: 1,
        winner_registration_id: 'r1',
        scheduled_at: null,
        matches: null
      })
    ]

    const placements = await createTournamentPlacementRepository(
      fakeClient(rows)
    ).findByRegistrations([{ id: 'r1', tournament_id: 't1' }])

    expect(placements.map((p) => p.category_id)).toEqual(['b', 'a', 'c'])
  })
})

describe('ChampionshipService', () => {
  it('returns one entry per title, linking to the event and category', async () => {
    const rows = [
      row({
        category_id: 'cat-1',
        round: 2,
        winner_registration_id: 'r1',
        tournament_categories: { name: '4.0 Mixed Doubles' }
      })
    ]

    const titles = await createChampionshipService(
      fakeClient(rows, [{ id: 'r1', tournament_id: 't1' }])
    ).championshipsFor('player-1')

    expect(titles).toHaveLength(1)
    expect(titles[0].label).toBe('Summer Slam — 4.0 Mixed Doubles')
    expect(titles[0].href).toBe('/events/e1?category=cat-1')
  })

  it('omits the category from the link when the draw is undivided', async () => {
    const rows = [row({ round: 2, winner_registration_id: 'r1' })]

    const titles = await createChampionshipService(
      fakeClient(rows, [{ id: 'r1', tournament_id: 't1' }])
    ).championshipsFor('player-1')

    expect(titles[0].label).toBe('Summer Slam')
    expect(titles[0].href).toBe('/events/e1')
  })

  it('gives no link when the tournament has no event to link to', async () => {
    // A link that 404s is worse than a badge that does not move, so the page is
    // told there is nowhere to go rather than left to guess a URL.
    const rows = [
      row({
        round: 2,
        winner_registration_id: 'r1',
        tournaments: { name: 'Orphan Cup', event_id: null, events: null }
      })
    ]

    const titles = await createChampionshipService(
      fakeClient(rows, [{ id: 'r1', tournament_id: 't1' }])
    ).championshipsFor('player-1')

    expect(titles[0].href).toBeNull()
    expect(titles[0].label).toBe('Orphan Cup')
  })

  it('reports only titles, never runner-up finishes', async () => {
    const rows = [
      row({
        round: 2,
        winner_registration_id: 'r9',
        participant1_registration_id: 'r9',
        participant2_registration_id: 'r1'
      })
    ]

    expect(
      await createChampionshipService(
        fakeClient(rows, [{ id: 'r1', tournament_id: 't1' }])
      ).championshipsFor('player-1')
    ).toEqual([])
  })

  it('returns nothing for a player who has never entered a tournament', async () => {
    expect(
      await createChampionshipService(fakeClient([], [])).championshipsFor('player-1')
    ).toEqual([])
  })
})
