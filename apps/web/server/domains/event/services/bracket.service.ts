import type { BracketRepository } from '../repositories/bracket.repository'
import type { TournamentRegistrationRepository, TournamentRepository } from '../repositories/tournament.repository'
import type { EventRepository } from '../repositories/event.repository'
import type {
  BracketDto,
  BracketMatchDto,
  BracketMatchRecord,
  BracketRoundDto,
  UpdateBracketMatchInput
} from '../dto/bracket.dto'
import { toBracketMatchDto } from '../dto/bracket.dto'

export class BracketServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface BracketService {
  getBracket(tournamentId: string, categoryId?: string | null): Promise<BracketDto>
  generateBracket(
    playerId: string,
    tournamentId: string,
    categoryId?: string | null
  ): Promise<BracketDto>
  updateBracketMatch(
    playerId: string,
    bracketMatchId: string,
    input: UpdateBracketMatchInput
  ): Promise<BracketMatchDto>
}

export function createBracketService(
  brackets: BracketRepository,
  tournaments: TournamentRepository,
  registrations: TournamentRegistrationRepository,
  events: EventRepository
): BracketService {
  async function assertEventOrganizer(playerId: string, eventId: string) {
    const event = await events.findById(eventId)
    if (!event) {
      throw new BracketServiceError(404, 'NOT_FOUND', 'Event not found.')
    }
    if (event.created_by_player_id !== playerId) {
      throw new BracketServiceError(403, 'FORBIDDEN', 'Only the event organizer can manage brackets.')
    }
    return event
  }

  function groupByRound(matches: BracketMatchDto[]): BracketRoundDto[] {
    const roundMap = new Map<number, BracketMatchDto[]>()
    for (const match of matches) {
      const existing = roundMap.get(match.round) ?? []
      existing.push(match)
      roundMap.set(match.round, existing)
    }
    return Array.from(roundMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, roundMatches]) => ({ round, matches: roundMatches }))
  }

  return {
    async getBracket(tournamentId, categoryId) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }

      const bracketMatches = await brackets.findByTournamentId(tournamentId, categoryId)
      const matchDtos = bracketMatches.map(toBracketMatchDto)

      return {
        tournament_id: tournamentId,
        category_id: categoryId ?? null,
        rounds: groupByRound(matchDtos)
      }
    },

    async generateBracket(playerId, tournamentId, categoryId) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }

      await assertEventOrganizer(playerId, tournament.event_id)

      if (tournament.status !== 'draft' && tournament.status !== 'open') {
        throw new BracketServiceError(
          409,
          'INVALID_TOURNAMENT_STATE',
          `Cannot generate bracket for a tournament that is already '${tournament.status}'.`
        )
      }

      const allRegs = await registrations.findByTournamentId(tournamentId)
      const confirmedRegs = allRegs
        .filter((r) => r.status === 'confirmed' || r.status === 'pending')
        .filter((r) => (categoryId === undefined ? true : r.category_id === categoryId))

      if (confirmedRegs.length < 2) {
        throw new BracketServiceError(
          400,
          'INSUFFICIENT_PARTICIPANTS',
          'At least 2 participants are required to generate a bracket.'
        )
      }

      // Only wipe this category's own bracket — other categories' brackets in the same
      // tournament must survive regenerating one of them.
      await brackets.deleteByTournamentId(tournamentId, categoryId)

      const registrationIds = confirmedRegs.map((r) => r.id)
      let bracketMatches: Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[]

      switch (tournament.format) {
        case 'double_elimination':
          bracketMatches = generateDoubleEliminationBracket(tournamentId, registrationIds, categoryId ?? null)
          break
        case 'round_robin':
          bracketMatches = generateRoundRobinBracket(tournamentId, registrationIds, categoryId ?? null)
          break
        case 'pool_play':
          bracketMatches = generatePoolPlayBracket(tournamentId, registrationIds, categoryId ?? null)
          break
        case 'single_elimination':
        default:
          bracketMatches = generateSingleEliminationBracket(tournamentId, registrationIds, categoryId ?? null)
          break
      }
      const created = await brackets.createMany(bracketMatches)
      const matchDtos = created.map(toBracketMatchDto)

      return {
        tournament_id: tournamentId,
        category_id: categoryId ?? null,
        rounds: groupByRound(matchDtos)
      }
    },

    async updateBracketMatch(playerId, bracketMatchId, input) {
      const bracketMatch = await brackets.findById(bracketMatchId)
      if (!bracketMatch) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Bracket match not found.')
      }

      const tournament = await tournaments.findById(bracketMatch.tournament_id)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }

      await assertEventOrganizer(playerId, tournament.event_id)

      if (input.winner_registration_id) {
        assertWinnerIsAParticipant(bracketMatch, input.winner_registration_id)
      }

      const updated = await brackets.update(bracketMatchId, input)
      await advanceWinner(updated, tournament.format)
      return toBracketMatchDto(updated)
    }
  }

  /**
   * A recorded winner must be one of the two entrants in that slot. Without this
   * the PATCH endpoint would accept any registration id and quietly promote a
   * player who never played the match.
   */
  function assertWinnerIsAParticipant(match: BracketMatchRecord, winnerId: string) {
    if (
      winnerId !== match.participant1_registration_id &&
      winnerId !== match.participant2_registration_id
    ) {
      throw new BracketServiceError(
        400,
        'INVALID_WINNER',
        'The winner must be one of the two participants in this match.'
      )
    }
  }

  /**
   * Moves a completed slot's winner into the next round.
   *
   * Previously nothing did this: an organiser could record every round-one
   * result and round two stayed empty, so a tournament could not progress past
   * its first round.
   *
   * Scope, deliberately narrow:
   *  - single elimination, and the WINNERS side of double elimination (rounds
   *    below the 100 offset the generator uses for the losers bracket);
   *  - round robin and pool play have no advancement — every fixture is drawn
   *    up front — so they are skipped;
   *  - double elimination's losers bracket is NOT routed. Correct loser
   *    placement depends on the round-by-round drop pattern, which the current
   *    generator only approximates, and a wrong route is worse than an empty
   *    one. Tracked as a backlog item; the winners side still advances.
   */
  async function advanceWinner(match: BracketMatchRecord, format: string) {
    if (format !== 'single_elimination' && format !== 'double_elimination') return
    if (!match.winner_registration_id) return
    if (match.status !== 'completed' && match.status !== 'bye') return

    // The losers bracket (100+) and grand final (200) are not routed.
    const LOSERS_BRACKET_ROUND_OFFSET = 100
    if (match.round >= LOSERS_BRACKET_ROUND_OFFSET) return

    const next = nextSlotFor(match.round, match.position)
    const siblings = await brackets.findByTournamentId(
      match.tournament_id,
      match.category_id ?? undefined
    )
    const target = siblings.find((m) => m.round === next.round && m.position === next.position)
    if (!target) return // this was the final

    const occupant =
      next.slot === 1 ? target.participant1_registration_id : target.participant2_registration_id
    if (occupant === match.winner_registration_id) return // already advanced

    const other =
      next.slot === 1 ? target.participant2_registration_id : target.participant1_registration_id

    await brackets.setParticipant(
      target.id,
      next.slot,
      match.winner_registration_id,
      other ? 'ready' : 'pending'
    )
  }
}

/**
 * Fisher-Yates. `[...ids].sort(() => Math.random() - 0.5)` was used before and
 * is not a uniform shuffle — the comparator is inconsistent, so the result is
 * biased toward the input order and the bias varies by engine. Seeding fairness
 * depends on this being uniform.
 */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

type NewBracketMatch = Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>

/**
 * Builds round one for a knockout bracket.
 *
 * Byes are allocated to the top seeds first and each occupies a whole slot on
 * its own, then the remaining entrants are paired off. The previous version
 * walked participants and byes in a single pass, which for 5 entrants in an
 * 8-slot bracket emitted a fourth slot with both participants null, status
 * 'bye' and a null winner — a phantom match that advanced nobody.
 */
function buildFirstRound(
  tournamentId: string,
  seeds: string[],
  bracketSize: number,
  categoryId: string | null
): NewBracketMatch[] {
  const numByes = bracketSize - seeds.length
  const matches: NewBracketMatch[] = []
  let position = 1
  let index = 0

  for (let i = 0; i < numByes; i++) {
    const participant = seeds[index++]
    matches.push({
      tournament_id: tournamentId,
      round: 1,
      position: position++,
      match_id: null,
      participant1_registration_id: participant,
      participant2_registration_id: null,
      winner_registration_id: participant,
      status: 'bye',
      scheduled_at: null,
      category_id: categoryId
    })
  }

  while (index < seeds.length) {
    const participant1 = seeds[index++]
    const participant2 = seeds[index++] ?? null
    matches.push({
      tournament_id: tournamentId,
      round: 1,
      position: position++,
      match_id: null,
      participant1_registration_id: participant1,
      participant2_registration_id: participant2,
      winner_registration_id: participant2 ? null : participant1,
      status: participant2 ? 'ready' : 'bye',
      scheduled_at: null,
      category_id: categoryId
    })
  }

  return matches
}

/**
 * Where the winner of a knockout slot goes next.
 *
 * Positions are sequential within a round, so pairs collapse: positions 1 and 2
 * both feed round+1 position 1, filling slot 1 and slot 2 respectively. Returns
 * null for a round that has no successor (the final) — and for the losers
 * bracket, which this does not attempt to route (see advanceWinner).
 */
export function nextSlotFor(
  round: number,
  position: number
): { round: number; position: number; slot: 1 | 2 } {
  return {
    round: round + 1,
    position: Math.ceil(position / 2),
    slot: position % 2 === 1 ? 1 : 2
  }
}

/**
 * Walks first-round byes into round two at generation time.
 *
 * A bye already knows its winner the moment the bracket is drawn, so leaving it
 * un-advanced meant round two opened with empty slots that nothing would ever
 * fill — the bracket looked generated but could not be played past round one.
 */
function propagateByes(matches: NewBracketMatch[]): NewBracketMatch[] {
  const byPosition = new Map<string, NewBracketMatch>()
  for (const m of matches) {
    byPosition.set(`${m.round}:${m.position}`, m)
  }

  for (const m of matches) {
    if (m.round !== 1 || m.status !== 'bye' || !m.winner_registration_id) continue

    const next = nextSlotFor(m.round, m.position)
    const target = byPosition.get(`${next.round}:${next.position}`)
    if (!target) continue

    if (next.slot === 1) target.participant1_registration_id = m.winner_registration_id
    else target.participant2_registration_id = m.winner_registration_id

    target.status =
      target.participant1_registration_id && target.participant2_registration_id
        ? 'ready'
        : 'pending'
  }

  return matches
}

function generateSingleEliminationBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): NewBracketMatch[] {
  const bracketSize = nextPowerOfTwo(registrationIds.length)
  const numRounds = Math.log2(bracketSize)

  const matches: NewBracketMatch[] = buildFirstRound(
    tournamentId,
    shuffle(registrationIds),
    bracketSize,
    categoryId
  )

  for (let round = 2; round <= numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round)
    for (let position = 1; position <= matchesInRound; position++) {
      matches.push({
        tournament_id: tournamentId,
        round,
        position,
        match_id: null,
        participant1_registration_id: null,
        participant2_registration_id: null,
        winner_registration_id: null,
        status: 'pending',
        scheduled_at: null,
        category_id: categoryId
      })
    }
  }

  return propagateByes(matches)
}

function nextPowerOfTwo(n: number): number {
  let power = 1
  while (power < n) {
    power *= 2
  }
  return power
}

function generateDoubleEliminationBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): NewBracketMatch[] {
  const bracketSize = nextPowerOfTwo(registrationIds.length)
  const numWinnersRounds = Math.log2(bracketSize)

  const matches: NewBracketMatch[] = buildFirstRound(
    tournamentId,
    shuffle(registrationIds),
    bracketSize,
    categoryId
  )

  for (let round = 2; round <= numWinnersRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round)
    for (let position = 1; position <= matchesInRound; position++) {
      matches.push({
        tournament_id: tournamentId,
        round,
        position,
        match_id: null,
        participant1_registration_id: null,
        participant2_registration_id: null,
        winner_registration_id: null,
        status: 'pending',
        scheduled_at: null,
        category_id: categoryId
      })
    }
  }

  const losersRoundOffset = 100
  const numLosersRounds = (numWinnersRounds - 1) * 2

  for (let losersRound = 1; losersRound <= numLosersRounds; losersRound++) {
    const effectiveRound = Math.ceil(losersRound / 2)
    const matchesInRound = bracketSize / Math.pow(2, effectiveRound + 1)
    for (let position = 1; position <= Math.max(1, matchesInRound); position++) {
      matches.push({
        tournament_id: tournamentId,
        round: losersRoundOffset + losersRound,
        position,
        match_id: null,
        participant1_registration_id: null,
        participant2_registration_id: null,
        winner_registration_id: null,
        status: 'pending',
        scheduled_at: null,
        category_id: categoryId
      })
    }
  }

  matches.push({
    tournament_id: tournamentId,
    round: 200,
    position: 1,
    match_id: null,
    participant1_registration_id: null,
    participant2_registration_id: null,
    winner_registration_id: null,
    status: 'pending',
    scheduled_at: null,
    category_id: categoryId
  })

  // Winners-bracket byes only. Losers-bracket routing is not implemented — see
  // the note in advanceWinner.
  return propagateByes(matches)
}

function generateRoundRobinBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[] {
  const n = registrationIds.length
  const matches: Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[] = []

  const numRounds = n % 2 === 0 ? n - 1 : n

  const participants = [...registrationIds]
  if (n % 2 !== 0) {
    participants.push('BYE')
  }

  const fixed = participants[0]
  const rotating = participants.slice(1)

  for (let round = 1; round <= numRounds; round++) {
    const currentOrder = [fixed, ...rotating]
    let position = 1

    for (let i = 0; i < currentOrder.length / 2; i++) {
      const p1 = currentOrder[i]
      const p2 = currentOrder[currentOrder.length - 1 - i]

      if (p1 === 'BYE' || p2 === 'BYE') {
        continue
      }

      matches.push({
        tournament_id: tournamentId,
        round,
        position: position++,
        match_id: null,
        participant1_registration_id: p1,
        participant2_registration_id: p2,
        winner_registration_id: null,
        status: 'ready',
        scheduled_at: null,
        category_id: categoryId
      })
    }

    const last = rotating.pop()!
    rotating.unshift(last)
  }

  return matches
}

function generatePoolPlayBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[] {
  const n = registrationIds.length
  const matches: Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[] = []

  const numPools = n >= 8 ? Math.ceil(n / 4) : 2
  const pools: string[][] = Array.from({ length: numPools }, () => [])

  const shuffled = shuffle(registrationIds)
  shuffled.forEach((id, i) => {
    pools[i % numPools].push(id)
  })

  const poolRoundOffset = 10
  pools.forEach((pool, poolIndex) => {
    const poolRound = poolRoundOffset + poolIndex
    let position = 1

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        matches.push({
          tournament_id: tournamentId,
          round: poolRound,
          position: position++,
          match_id: null,
          participant1_registration_id: pool[i],
          participant2_registration_id: pool[j],
          winner_registration_id: null,
          status: 'ready',
          scheduled_at: null,
          category_id: categoryId
        })
      }
    }
  })

  const playoffSize = nextPowerOfTwo(numPools * 2)
  const numPlayoffRounds = Math.log2(playoffSize)
  const playoffRoundOffset = 50

  for (let round = 1; round <= numPlayoffRounds; round++) {
    const matchesInRound = playoffSize / Math.pow(2, round)
    for (let position = 1; position <= matchesInRound; position++) {
      matches.push({
        tournament_id: tournamentId,
        round: playoffRoundOffset + round,
        position,
        match_id: null,
        participant1_registration_id: null,
        participant2_registration_id: null,
        winner_registration_id: null,
        status: 'pending',
        scheduled_at: null,
        category_id: categoryId
      })
    }
  }

  return matches
}
