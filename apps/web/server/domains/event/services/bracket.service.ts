import type { BracketRepository } from '../repositories/bracket.repository'
import type { TournamentRegistrationRepository, TournamentRepository } from '../repositories/tournament.repository'
import type { EventRepository } from '../repositories/event.repository'
import type { BracketDto, BracketMatchDto, BracketRoundDto, UpdateBracketMatchInput } from '../dto/bracket.dto'
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

      const bracketMatches = generateSingleEliminationBracket(
        tournamentId,
        confirmedRegs.map((r) => r.id),
        categoryId ?? null
      )
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

      const updated = await brackets.update(bracketMatchId, input)
      return toBracketMatchDto(updated)
    }
  }
}

function generateSingleEliminationBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[] {
  const n = registrationIds.length
  const bracketSize = nextPowerOfTwo(n)
  const numRounds = Math.log2(bracketSize)
  const numByes = bracketSize - n

  const shuffled = [...registrationIds].sort(() => Math.random() - 0.5)

  const matches: Omit<import('../dto/bracket.dto').BracketMatchRecord, 'id' | 'created_at'>[] = []

  const firstRoundMatches = bracketSize / 2
  let participantIndex = 0
  let byesRemaining = numByes

  for (let position = 1; position <= firstRoundMatches; position++) {
    const participant1 = shuffled[participantIndex++] ?? null

    let participant2: string | null = null
    let status: import('../dto/bracket.dto').BracketMatchStatus = 'pending'

    if (byesRemaining > 0 && participantIndex >= n) {
      status = 'bye'
      byesRemaining--
    } else if (participantIndex < shuffled.length) {
      participant2 = shuffled[participantIndex++] ?? null
      if (participant1 && participant2) {
        status = 'ready'
      }
    } else {
      status = 'bye'
    }

    matches.push({
      tournament_id: tournamentId,
      round: 1,
      position,
      match_id: null,
      participant1_registration_id: participant1,
      participant2_registration_id: participant2,
      winner_registration_id: status === 'bye' ? participant1 : null,
      status,
      scheduled_at: null,
      category_id: categoryId
    })
  }

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

  return matches
}

function nextPowerOfTwo(n: number): number {
  let power = 1
  while (power < n) {
    power *= 2
  }
  return power
}
