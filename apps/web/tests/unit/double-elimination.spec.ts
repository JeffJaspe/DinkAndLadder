import { describe, expect, it, vi } from 'vitest'
import { createBracketService } from '../../server/domains/event/services/bracket.service'
import type { BracketRepository } from '../../server/domains/event/repositories/bracket.repository'
import type { BracketMatchRecord } from '../../server/domains/event/dto/bracket.dto'
import type {
  TournamentRepository,
  TournamentRegistrationRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import {
  GRAND_FINAL_RESET_ROUND,
  GRAND_FINAL_ROUND,
  LOSERS_ROUND_OFFSET
} from '../../utils/bracket-rounds'

/**
 * Double elimination, played end to end.
 *
 * Before this, `advanceWinner` bailed out with "the losers bracket (100+) and
 * grand final (200) are not routed" — so winners advanced, losers vanished, and
 * every losers-bracket match stayed a pair of TBDs that could never be filled.
 * A "double elimination" draw was in practice a single elimination with an
 * unreachable second half, and the grand final never got either participant.
 *
 * These tests drive the real service against an in-memory bracket repository,
 * because the bug was in the routing between matches — exactly the thing a
 * generator-shape assertion cannot see.
 */

const TOURNAMENT_ID = 'tournament-1'
const EVENT_ID = 'event-1'
const ORGANIZER = 'player-1'

/** An in-memory stand-in for the bracket table, so results really propagate. */
function inMemoryBrackets() {
  const rows: BracketMatchRecord[] = []

  const repo: BracketRepository = {
    findById: vi.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
    findByTournamentId: vi.fn(async () => rows.map((r) => ({ ...r }))),
    createMany: vi.fn(async (matches: Omit<BracketMatchRecord, 'id' | 'created_at'>[]) => {
      const created = matches.map((m, i) => ({
        ...m,
        id: `bm-${rows.length + i + 1}`,
        created_at: '2026-08-01T00:00:00Z'
      })) as BracketMatchRecord[]
      rows.push(...created)
      return created.map((r) => ({ ...r }))
    }),
    update: vi.fn(async (id: string, patch: Partial<BracketMatchRecord>) => {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error('no such bracket match')
      Object.assign(row, patch)
      return { ...row }
    }),
    setParticipant: vi.fn(
      async (id: string, slot: 1 | 2, registrationId: string | null, status: string) => {
        const row = rows.find((r) => r.id === id)
        if (!row) throw new Error('no such bracket match')
        if (slot === 1) row.participant1_registration_id = registrationId
        else row.participant2_registration_id = registrationId
        row.status = status as BracketMatchRecord['status']
        return { ...row }
      }
    ),
    deleteByTournamentId: vi.fn(async () => {
      rows.length = 0
    }),
    countRecordedResults: vi.fn(async () => 0)
  } as unknown as BracketRepository

  return { repo, rows }
}

function makeService(brackets: BracketRepository) {
  const tournaments = {
    findById: vi.fn(async () => ({
      id: TOURNAMENT_ID,
      event_id: EVENT_ID,
      status: 'open',
      format: 'double_elimination',
      match_type: 'singles',
      max_participants: null,
      bracket_locked_at: null
    })),
    findByEventId: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    setBracketLock: vi.fn()
  } as unknown as TournamentRepository

  const registrations = {
    findById: vi.fn(async () => null),
    findCategoryEntrants: vi.fn(async () => []),
    findByTournamentId: vi.fn(async () => []),
    findByTournamentIdWithPlayers: vi.fn(async () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: `reg-${i + 1}`,
        tournament_id: TOURNAMENT_ID,
        player_id: `player-${i + 1}`,
        partner_player_id: null,
        category_id: null,
        status: 'confirmed',
        seed: i + 1,
        registered_at: '2026-08-01T00:00:00Z',
        player: { id: `player-${i + 1}`, display_name: `P${i + 1}` },
        partner: null
      }))
    ),
    countByTournament: vi.fn(async () => 8),
    create: vi.fn(),
    updateStatus: vi.fn()
  } as unknown as TournamentRegistrationRepository

  const events = {
    findById: vi.fn(async () => ({
      id: EVENT_ID,
      created_by_player_id: ORGANIZER,
      club_id: 'club-1',
      status: 'published'
    }))
  } as unknown as EventRepository

  return createBracketService(brackets, tournaments, registrations, events)
}

/** Declares a winner on a bracket match through the organiser override path. */
async function win(
  service: ReturnType<typeof makeService>,
  rows: BracketMatchRecord[],
  round: number,
  position: number,
  slot: 1 | 2
) {
  const match = rows.find((r) => r.round === round && r.position === position)
  if (!match) throw new Error(`no match at round ${round} position ${position}`)

  const winner =
    slot === 1 ? match.participant1_registration_id : match.participant2_registration_id
  if (!winner) throw new Error(`slot ${slot} of round ${round}/${position} is empty`)

  await service.updateBracketMatch(ORGANIZER, match.id, {
    winner_registration_id: winner,
    status: 'completed'
  })
  return winner
}

function at(rows: BracketMatchRecord[], round: number, position = 1) {
  const row = rows.find((r) => r.round === round && r.position === position)
  if (!row) throw new Error(`no match at round ${round} position ${position}`)
  return row
}

/** Plays every round up to (but not including) the grand final. */
async function playToGrandFinal(
  service: ReturnType<typeof makeService>,
  rows: BracketMatchRecord[]
) {
  for (let position = 1; position <= 4; position++) await win(service, rows, 1, position, 1)
  for (let position = 1; position <= 2; position++) await win(service, rows, 2, position, 1)
  await win(service, rows, 3, 1, 1)
  for (let position = 1; position <= 2; position++) {
    await win(service, rows, LOSERS_ROUND_OFFSET + 1, position, 1)
  }
  for (let position = 1; position <= 2; position++) {
    await win(service, rows, LOSERS_ROUND_OFFSET + 2, position, 1)
  }
  await win(service, rows, LOSERS_ROUND_OFFSET + 3, 1, 1)
  await win(service, rows, LOSERS_ROUND_OFFSET + 4, 1, 1)
}

describe('double elimination — the losers bracket fills', () => {
  it('sends first-round losers into losers round 1', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    // Before any result, the whole losers bracket is empty.
    const lr1 = rows.filter((r) => r.round === LOSERS_ROUND_OFFSET + 1)
    expect(lr1).toHaveLength(2)
    expect(lr1.every((m) => !m.participant1_registration_id)).toBe(true)

    // Winners round 1, match 1: slot 1 wins, so slot 2 drops.
    const loser1 = at(rows, 1, 1).participant2_registration_id
    await win(service, rows, 1, 1, 1)

    expect(at(rows, LOSERS_ROUND_OFFSET + 1, 1).participant1_registration_id).toBe(loser1)
  })

  it('pairs two first-round losers into one losers-round match', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    const loserA = at(rows, 1, 1).participant2_registration_id
    const loserB = at(rows, 1, 2).participant2_registration_id

    await win(service, rows, 1, 1, 1)
    await win(service, rows, 1, 2, 1)

    // Matches 1 and 2 feed the same losers match, by parity.
    const target = at(rows, LOSERS_ROUND_OFFSET + 1, 1)
    expect(target.participant1_registration_id).toBe(loserA)
    expect(target.participant2_registration_id).toBe(loserB)
    // Both slots filled, so it is playable.
    expect(target.status).toBe('ready')
  })

  it('drops a second-round loser into the matching losers round', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    for (let position = 1; position <= 4; position++) {
      await win(service, rows, 1, position, 1)
    }

    // Winners round 2 match 1: its loser drops into losers round 2 (2r-2 = 2).
    const loser = at(rows, 2, 1).participant2_registration_id
    expect(loser).toBeTruthy()
    await win(service, rows, 2, 1, 1)

    expect(at(rows, LOSERS_ROUND_OFFSET + 2, 1).participant2_registration_id).toBe(loser)
  })
})

describe('double elimination — the grand final fills from both sides', () => {
  it('routes the winners finalist and the losers survivor into the grand final', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    // Winners bracket: slot 1 wins everything.
    for (let position = 1; position <= 4; position++) await win(service, rows, 1, position, 1)
    for (let position = 1; position <= 2; position++) await win(service, rows, 2, position, 1)
    const winnersFinalist = await win(service, rows, 3, 1, 1)

    // The winners finalist takes slot 1 of the grand final — the case that used
    // to fall through nextSlotFor and be treated as "this was the final".
    expect(at(rows, GRAND_FINAL_ROUND).participant1_registration_id).toBe(winnersFinalist)

    // Losers bracket, played through in order.
    for (let position = 1; position <= 2; position++) {
      await win(service, rows, LOSERS_ROUND_OFFSET + 1, position, 1)
    }
    for (let position = 1; position <= 2; position++) {
      await win(service, rows, LOSERS_ROUND_OFFSET + 2, position, 1)
    }
    await win(service, rows, LOSERS_ROUND_OFFSET + 3, 1, 1)
    const losersSurvivor = await win(service, rows, LOSERS_ROUND_OFFSET + 4, 1, 1)

    const grandFinal = at(rows, GRAND_FINAL_ROUND)
    expect(grandFinal.participant2_registration_id).toBe(losersSurvivor)
    expect(grandFinal.status).toBe('ready')
    // Two different people, which is the point of the format.
    expect(grandFinal.participant1_registration_id).not.toBe(
      grandFinal.participant2_registration_id
    )
  })

  it('leaves nothing unreachable — every losers match gets both participants', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    for (let position = 1; position <= 4; position++) await win(service, rows, 1, position, 1)
    for (let position = 1; position <= 2; position++) await win(service, rows, 2, position, 1)
    await win(service, rows, 3, 1, 1)

    for (let position = 1; position <= 2; position++) {
      await win(service, rows, LOSERS_ROUND_OFFSET + 1, position, 1)
    }
    for (let position = 1; position <= 2; position++) {
      await win(service, rows, LOSERS_ROUND_OFFSET + 2, position, 1)
    }
    await win(service, rows, LOSERS_ROUND_OFFSET + 3, 1, 1)

    const losersMatches = rows.filter(
      (r) => r.round >= LOSERS_ROUND_OFFSET && r.round < GRAND_FINAL_ROUND
    )
    expect(losersMatches).toHaveLength(6) // 2 + 2 + 1 + 1 for an 8-draw

    for (const match of losersMatches) {
      expect(match.participant1_registration_id).toBeTruthy()
      expect(match.participant2_registration_id).toBeTruthy()
    }
  })

  it('nothing follows the grand final', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    for (let position = 1; position <= 4; position++) await win(service, rows, 1, position, 1)
    for (let position = 1; position <= 2; position++) await win(service, rows, 2, position, 1)
    await win(service, rows, 3, 1, 1)
    for (let position = 1; position <= 2; position++) {
      await win(service, rows, LOSERS_ROUND_OFFSET + 1, position, 1)
    }
    for (let position = 1; position <= 2; position++) {
      await win(service, rows, LOSERS_ROUND_OFFSET + 2, position, 1)
    }
    await win(service, rows, LOSERS_ROUND_OFFSET + 3, 1, 1)
    await win(service, rows, LOSERS_ROUND_OFFSET + 4, 1, 1)

    // Declaring the grand final must not throw or try to route anywhere.
    const champion = await win(service, rows, GRAND_FINAL_ROUND, 1, 1)
    expect(champion).toBeTruthy()
    expect(at(rows, GRAND_FINAL_ROUND).winner_registration_id).toBe(champion)
  })
})

describe('grand final reset — nobody goes out on one defeat', () => {
  it('leaves the decider empty when the unbeaten finalist wins', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)
    await playToGrandFinal(service, rows)

    // Slot 1 is the winners finalist, who arrived unbeaten.
    await win(service, rows, GRAND_FINAL_ROUND, 1, 1)

    const reset = at(rows, GRAND_FINAL_RESET_ROUND)
    expect(reset.participant1_registration_id).toBeNull()
    expect(reset.participant2_registration_id).toBeNull()
  })

  it('seeds the decider when the losers-bracket entrant wins', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)
    await playToGrandFinal(service, rows)

    const grandFinal = at(rows, GRAND_FINAL_ROUND)
    const unbeaten = grandFinal.participant1_registration_id
    const challenger = grandFinal.participant2_registration_id

    // Slot 2 is the losers-bracket entrant: both now have exactly one defeat,
    // so the title cannot be awarded on this game alone.
    await win(service, rows, GRAND_FINAL_ROUND, 1, 2)

    const reset = at(rows, GRAND_FINAL_RESET_ROUND)
    expect(reset.participant1_registration_id).toBe(unbeaten)
    expect(reset.participant2_registration_id).toBe(challenger)
    expect(reset.status).toBe('ready')
  })

  it('settles the title on the decider, and routes nowhere after it', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)
    await playToGrandFinal(service, rows)
    await win(service, rows, GRAND_FINAL_ROUND, 1, 2)

    const champion = await win(service, rows, GRAND_FINAL_RESET_ROUND, 1, 1)
    expect(at(rows, GRAND_FINAL_RESET_ROUND).winner_registration_id).toBe(champion)
  })

  it('generates exactly one decider slot', async () => {
    const { repo, rows } = inMemoryBrackets()
    const service = makeService(repo)
    await service.generateBracket(ORGANIZER, TOURNAMENT_ID)

    expect(rows.filter((r) => r.round === GRAND_FINAL_RESET_ROUND)).toHaveLength(1)
  })
})
