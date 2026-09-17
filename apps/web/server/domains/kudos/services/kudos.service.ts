import type { KudosRepository } from '../repositories/kudos.repository'
import type { MatchRepository } from '~/server/domains/match/repositories/match.repository'
import type { GiveKudosInput, KudosRecord, PlayerKudosDto } from '../dto/kudos.dto'
import { isKudosSkill, toPlayerKudosDto } from '../dto/kudos.dto'

export class KudosServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/** What the match screen needs to draw the control. */
export interface MatchKudosStateDto {
  /** Opponents in this match the reader may still credit. */
  eligible: { player_id: string }[]
  /** Kudos the reader has already given here, so the UI shows them as done. */
  given: { to_player_id: string; skill: string }[]
  /** Why the control is unavailable, or null when it is available. */
  unavailable_reason: string | null
}

export interface KudosService {
  give(fromPlayerId: string, input: GiveKudosInput): Promise<KudosRecord>
  forMatch(matchId: string, readerPlayerId: string): Promise<MatchKudosStateDto>
  forPlayer(playerId: string): Promise<PlayerKudosDto>
}

/**
 * Kudos: an opponent crediting one skill, once per match.
 *
 * Every part of that sentence is a rule enforced here, because each one is what
 * keeps a tally worth reading:
 *
 * - **Opponent**, not teammate and not a bystander. You earn it from the person
 *   across the net, which is the only party with a reason to be honest about it.
 * - **Once per match, per opponent.** In doubles that is two kudos available to
 *   you, one for each of them. The database holds the same rule as a unique
 *   constraint, because two taps racing each other would both pass a check made
 *   only here.
 * - **A verified match.** An unverified or rejected result is not a match that
 *   happened yet, and crediting a performance in one would let a pair invent
 *   matches to farm each other.
 *
 * There is deliberately no undo. Kudos is somebody's opinion of how you played,
 * recorded at the time; letting it be withdrawn turns it into leverage.
 */
export function createKudosService(kudos: KudosRepository, matches: MatchRepository): KudosService {
  /**
   * The reader's side of a match, and the other side, or null when they did not
   * play in it.
   */
  async function sidesOf(matchId: string, playerId: string) {
    const match = await matches.findById(matchId)
    if (!match) return { match: null, mine: null, opponents: [] as string[] }

    const me = match.match_participants?.find((p) => p.player_id === playerId) ?? null
    const opponents = (match.match_participants ?? [])
      .filter((p) => me && p.team_number !== me.team_number)
      .map((p) => p.player_id)

    return { match, mine: me, opponents }
  }

  return {
    async give(fromPlayerId, input) {
      if (!isKudosSkill(input.skill)) {
        throw new KudosServiceError(400, 'INVALID_SKILL', 'That is not a kudos skill.')
      }
      if (input.to_player_id === fromPlayerId) {
        throw new KudosServiceError(400, 'SELF_KUDOS', 'You cannot give yourself kudos.')
      }

      const { match, mine, opponents } = await sidesOf(input.match_id, fromPlayerId)
      if (!match) {
        throw new KudosServiceError(404, 'NOT_FOUND', 'Match not found.')
      }
      if (match.status !== 'verified') {
        throw new KudosServiceError(
          409,
          'MATCH_NOT_VERIFIED',
          'Kudos can only be given once the result is recorded.'
        )
      }
      if (!mine) {
        throw new KudosServiceError(403, 'NOT_A_PARTICIPANT', 'You did not play in this match.')
      }
      if (!opponents.includes(input.to_player_id)) {
        throw new KudosServiceError(
          403,
          'NOT_AN_OPPONENT',
          'Kudos go to the players on the other side of the net.'
        )
      }

      const already = await kudos.findByMatchAndGiver(input.match_id, fromPlayerId)
      if (already.some((k) => k.to_player_id === input.to_player_id)) {
        throw new KudosServiceError(
          409,
          'ALREADY_GIVEN',
          'You have already given this player kudos for this match.'
        )
      }

      try {
        return await kudos.create(input, fromPlayerId)
      } catch (err) {
        // The unique constraint is the real gate — two taps can both clear the
        // check above. Reported as the same conflict rather than a 500, because
        // from the player's side nothing went wrong: the kudos is recorded.
        if (
          typeof err === 'object' &&
          err !== null &&
          (err as { code?: string }).code === '23505'
        ) {
          throw new KudosServiceError(
            409,
            'ALREADY_GIVEN',
            'You have already given this player kudos for this match.'
          )
        }
        throw err
      }
    },

    async forMatch(matchId, readerPlayerId) {
      const { match, mine, opponents } = await sidesOf(matchId, readerPlayerId)

      if (!match) {
        return { eligible: [], given: [], unavailable_reason: 'Match not found.' }
      }
      if (!mine) {
        // Not an error — most people reading a match page did not play in it,
        // and the control simply is not theirs.
        return { eligible: [], given: [], unavailable_reason: null }
      }
      if (match.status !== 'verified') {
        return {
          eligible: [],
          given: [],
          unavailable_reason: 'Kudos open once the result is recorded.'
        }
      }

      const already = await kudos.findByMatchAndGiver(matchId, readerPlayerId)
      const done = new Set(already.map((k) => k.to_player_id))

      return {
        eligible: opponents.filter((id) => !done.has(id)).map((player_id) => ({ player_id })),
        given: already.map((k) => ({ to_player_id: k.to_player_id, skill: k.skill })),
        unavailable_reason: null
      }
    },

    async forPlayer(playerId) {
      return toPlayerKudosDto(await kudos.countByPlayer(playerId))
    }
  }
}
