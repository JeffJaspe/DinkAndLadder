import { describe, it, expect, vi } from 'vitest'
import { createKudosService, KudosServiceError } from '../../server/domains/kudos/services/kudos.service'
import {
  KUDOS_SKILLS,
  isKudosSkill,
  toPlayerKudosDto
} from '../../server/domains/kudos/dto/kudos.dto'
import type { KudosRepository } from '../../server/domains/kudos/repositories/kudos.repository'
import type { MatchRepository } from '../../server/domains/match/repositories/match.repository'
import type { MatchRecord } from '../../server/domains/match/dto/match.dto'

const ME = 'player-me'
const OPPONENT = 'player-opponent'
const TEAMMATE = 'player-teammate'

function makeMatch(overrides?: Partial<MatchRecord>): MatchRecord {
  return {
    id: 'match-1',
    status: 'verified',
    match_participants: [
      { id: 'mp1', match_id: 'match-1', player_id: ME, team_number: 1, result_status: 'won' },
      { id: 'mp2', match_id: 'match-1', player_id: TEAMMATE, team_number: 1, result_status: 'won' },
      { id: 'mp3', match_id: 'match-1', player_id: OPPONENT, team_number: 2, result_status: 'lost' },
      { id: 'mp4', match_id: 'match-1', player_id: 'player-other', team_number: 2, result_status: 'lost' }
    ],
    ...overrides
  } as unknown as MatchRecord
}

function fakeMatches(match: MatchRecord | null): MatchRepository {
  return { findById: vi.fn().mockResolvedValue(match) } as unknown as MatchRepository
}

function fakeKudos(existing: { to_player_id: string; skill: string }[] = []): KudosRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: 'k1' }),
    findByMatchAndGiver: vi.fn().mockResolvedValue(existing),
    countByPlayer: vi.fn().mockResolvedValue({})
  } as unknown as KudosRepository
}

const input = { match_id: 'match-1', to_player_id: OPPONENT, skill: 'dink' as const }

describe('kudos skills', () => {
  it('is a closed set of six', () => {
    expect(KUDOS_SKILLS).toHaveLength(6)
    expect(isKudosSkill('dink')).toBe(true)
    expect(isKudosSkill('smash')).toBe(false)
  })

  it('reports all six on a profile, zeroes included', () => {
    // A card that listed only what somebody had received would change shape per
    // player and read as a ranking rather than a tally.
    const dto = toPlayerKudosDto({ dink: 3, volley: 1 })
    expect(dto.tallies).toHaveLength(6)
    expect(dto.total).toBe(4)
    expect(dto.tallies.find((t) => t.skill === 'serve')?.count).toBe(0)
  })

  it('keeps the six in a fixed order regardless of the counts', () => {
    const order = toPlayerKudosDto({ sportsmanship: 9 }).tallies.map((t) => t.skill)
    expect(order).toEqual([...KUDOS_SKILLS])
  })
})

describe('KudosService.give', () => {
  it('records an opponent kudos', async () => {
    const kudos = fakeKudos()
    const service = createKudosService(kudos, fakeMatches(makeMatch()))

    await service.give(ME, input)

    expect(kudos.create).toHaveBeenCalledWith(input, ME)
  })

  it('refuses a teammate — kudos come from the other side of the net', async () => {
    const service = createKudosService(fakeKudos(), fakeMatches(makeMatch()))

    await expect(service.give(ME, { ...input, to_player_id: TEAMMATE })).rejects.toMatchObject({
      code: 'NOT_AN_OPPONENT'
    })
  })

  it('refuses somebody who did not play in the match', async () => {
    const service = createKudosService(fakeKudos(), fakeMatches(makeMatch()))

    await expect(service.give('player-stranger', input)).rejects.toMatchObject({
      code: 'NOT_A_PARTICIPANT'
    })
  })

  it('refuses a match that is not verified', async () => {
    // Otherwise a pair could invent matches to farm each other.
    const service = createKudosService(
      fakeKudos(),
      fakeMatches(makeMatch({ status: 'submitted' } as Partial<MatchRecord>))
    )

    await expect(service.give(ME, input)).rejects.toMatchObject({ code: 'MATCH_NOT_VERIFIED' })
  })

  it('refuses a second kudos to the same opponent in the same match', async () => {
    const service = createKudosService(
      fakeKudos([{ to_player_id: OPPONENT, skill: 'serve' }]),
      fakeMatches(makeMatch())
    )

    await expect(service.give(ME, input)).rejects.toMatchObject({ code: 'ALREADY_GIVEN' })
  })

  it('allows one kudos to each opponent in doubles', async () => {
    const kudos = fakeKudos([{ to_player_id: OPPONENT, skill: 'dink' }])
    const service = createKudosService(kudos, fakeMatches(makeMatch()))

    await service.give(ME, { ...input, to_player_id: 'player-other', skill: 'volley' })

    expect(kudos.create).toHaveBeenCalled()
  })

  it('treats a racing duplicate as already given, not as a crash', async () => {
    // The unique constraint is the real gate; two taps can both clear the
    // in-service check.
    const kudos = fakeKudos()
    kudos.create = vi.fn().mockRejectedValue({ code: '23505' })
    const service = createKudosService(kudos, fakeMatches(makeMatch()))

    await expect(service.give(ME, input)).rejects.toMatchObject({ code: 'ALREADY_GIVEN' })
  })

  it('refuses a skill outside the six', async () => {
    const service = createKudosService(fakeKudos(), fakeMatches(makeMatch()))

    await expect(
      service.give(ME, { ...input, skill: 'smash' as unknown as typeof input.skill })
    ).rejects.toBeInstanceOf(KudosServiceError)
  })

  it('refuses self-kudos', async () => {
    const service = createKudosService(fakeKudos(), fakeMatches(makeMatch()))

    await expect(service.give(ME, { ...input, to_player_id: ME })).rejects.toMatchObject({
      code: 'SELF_KUDOS'
    })
  })
})

describe('KudosService.forMatch', () => {
  it('offers the opponents not yet credited', async () => {
    const service = createKudosService(
      fakeKudos([{ to_player_id: OPPONENT, skill: 'dink' }]),
      fakeMatches(makeMatch())
    )

    const state = await service.forMatch('match-1', ME)

    expect(state.eligible.map((e) => e.player_id)).toEqual(['player-other'])
    expect(state.given).toEqual([{ to_player_id: OPPONENT, skill: 'dink' }])
    expect(state.unavailable_reason).toBeNull()
  })

  it('says why when the result is not recorded yet', async () => {
    const service = createKudosService(
      fakeKudos(),
      fakeMatches(makeMatch({ status: 'submitted' } as Partial<MatchRecord>))
    )

    const state = await service.forMatch('match-1', ME)

    expect(state.eligible).toEqual([])
    expect(state.unavailable_reason).toBe('Kudos open once the result is recorded.')
  })

  it('is quietly empty for a reader who did not play', async () => {
    // Most people reading a match page are not in it; that is not an error.
    const service = createKudosService(fakeKudos(), fakeMatches(makeMatch()))

    const state = await service.forMatch('match-1', 'player-stranger')

    expect(state).toEqual({ eligible: [], given: [], unavailable_reason: null })
  })
})
