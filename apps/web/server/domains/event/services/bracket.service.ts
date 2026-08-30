import type { BracketRepository } from '../repositories/bracket.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../repositories/tournament.repository'
import type { EventRepository } from '../repositories/event.repository'
import type {
  BracketDto,
  LiveBracketScore,
  BracketMatchDto,
  BracketMatchRecord,
  BracketMatchScoreDto,
  BracketParticipantDto,
  BracketRoundDto,
  RecordBracketResultInput,
  UpdateBracketMatchInput
} from '../dto/bracket.dto'
import { toBracketMatchDto } from '../dto/bracket.dto'
import type { MatchRepository } from '../../match/repositories/match.repository'
import type { MatchScoreLookupRow } from '../../match/dto/match.dto'
import type { TournamentCategoryRepository } from '../repositories/tournament-category.repository'
import { resolveBracketLock, resolveFormat, resolveMatchType } from '../dto/tournament-category.dto'
import type { TournamentFormat, TournamentMatchType } from '../dto/tournament.dto'
import { resolveEntrantRating } from '../dto/tournament.dto'
import { hasGroupStage } from '~/utils/tournament-formats'
import {
  GRAND_FINAL_RESET_ROUND,
  GRAND_FINAL_ROUND,
  isLosersRound,
  isPoolRound,
  LOSERS_ROUND_OFFSET,
  PLAYOFF_ROUND_OFFSET,
  POOL_ROUND_OFFSET,
  QUALIFIERS_PER_POOL
} from '~/utils/bracket-rounds'

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
  /**
   * `viewerPlayerId` decides how much of the draw comes back.
   *
   * An unlocked draw is the organiser's working copy — they may regenerate it
   * several times before it is right — so everyone else gets an empty rounds
   * list and the `locked: false` flag, and the card renders the placeholder
   * shape and the entrant list instead. Pass `undefined` for an anonymous read.
   */
  getBracket(
    tournamentId: string,
    categoryId?: string | null,
    viewerPlayerId?: string | null
  ): Promise<BracketDto>
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
  /**
   * Records the result of a slot: creates the match it refers to, links the two
   * together, and advances the winner.
   *
   * This is the only thing that ever writes `bracket_matches.match_id`. Without
   * it a draw could name a winner but never a score, because the score lives on
   * a `matches` row that nothing was creating.
   */
  /**
   * Puts a bracket match on court and starts its scoreboard.
   *
   * Distinct from recording a result: a started match has no winner and no
   * `matches` row. It becomes a real, verified result only through
   * recordMatchResult, which is unchanged.
   */
  startBracketMatch(playerId: string, bracketMatchId: string): Promise<BracketMatchDto>
  /** Updates the running score. Called repeatedly, so it writes one column. */
  updateBracketLiveScore(
    playerId: string,
    bracketMatchId: string,
    scores: LiveBracketScore[]
  ): Promise<BracketMatchDto>
  recordMatchResult(
    playerId: string,
    bracketMatchId: string,
    input: RecordBracketResultInput
  ): Promise<BracketMatchDto>
  /**
   * Throw the draw away and go back to the state before Generate.
   *
   * Regenerating already replaced a draw wholesale, so this adds no destructive
   * power that did not exist — what it adds is the ability to get back to "no
   * draw yet", which was previously unreachable once Generate had been pressed
   * even once by mistake.
   */
  undoBracket(playerId: string, tournamentId: string, categoryId?: string | null): Promise<void>
  /**
   * Freeze the draw: it becomes visible to players and results can be recorded
   * against it, and it can no longer be regenerated or undone.
   */
  lockBracket(
    playerId: string,
    tournamentId: string,
    categoryId?: string | null
  ): Promise<BracketDto>
  /** Reopen a draw for redrawing. Refused once any result exists. */
  unlockBracket(
    playerId: string,
    tournamentId: string,
    categoryId?: string | null
  ): Promise<BracketDto>
}

/**
 * Line a match's set scores up with the two bracket slots.
 *
 * `match_scores` is keyed to team1/team2, which is decided when the match is
 * submitted; a bracket slot is decided when the draw is made. Nothing keeps the
 * two in step, so the mapping has to be derived from who actually played.
 *
 * Returns [] rather than guessing whenever the mapping is not certain — an
 * ambiguous orientation would render a losing score as a winning one, and it
 * would look entirely believable.
 */
export function orientScores(
  row: Pick<MatchScoreLookupRow, 'participants' | 'scores'>,
  slot1PlayerIds: readonly string[],
  slot2PlayerIds: readonly string[]
): BracketMatchScoreDto[] {
  if (!row.scores.length) return []

  const teamOf = (playerIds: readonly string[]): 1 | 2 | null => {
    if (!playerIds.length) return null
    const hit = row.participants.find((participant) => playerIds.includes(participant.player_id))
    return hit ? hit.team_number : null
  }

  const slot1Team = teamOf(slot1PlayerIds)
  const slot2Team = teamOf(slot2PlayerIds)

  // Both slots resolving to the same team means the participant rows disagree
  // with the draw. Nothing sensible can be said about which column is which.
  if (slot1Team !== null && slot2Team !== null && slot1Team === slot2Team) return []

  // One side is enough: teams are 1 and 2, so the other follows.
  const resolved = slot1Team ?? (slot2Team === null ? null : slot2Team === 1 ? 2 : 1)
  if (resolved === null) return []

  return row.scores.map((score) => ({
    set_number: score.set_number,
    participant1_score: resolved === 1 ? score.team1_score : score.team2_score,
    participant2_score: resolved === 1 ? score.team2_score : score.team1_score
  }))
}

/**
 * `matches` is optional the way `registrations` is optional in
 * TournamentCategoryService: generating a bracket never needs a score, so the
 * callers that only generate one should not have to build a repository they do
 * not use. Without it a bracket still loads, every match simply carrying no
 * scores.
 */
export function createBracketService(
  brackets: BracketRepository,
  tournaments: TournamentRepository,
  registrations: TournamentRegistrationRepository,
  events: EventRepository,
  matches?: MatchRepository,
  /**
   * Read whenever a category's own singles/doubles or format matters: to stamp
   * a created match with the right type, and to draw the right shape of bracket.
   * Without it the TOURNAMENT's values are used throughout, which is exactly
   * what it was before categories could differ.
   */
  categories?: TournamentCategoryRepository
): BracketService {
  async function assertEventOrganizer(playerId: string, eventId: string) {
    const event = await events.findById(eventId)
    if (!event) {
      throw new BracketServiceError(404, 'NOT_FOUND', 'Event not found.')
    }
    if (event.created_by_player_id !== playerId) {
      throw new BracketServiceError(
        403,
        'FORBIDDEN',
        'Only the event organizer can manage brackets.'
      )
    }
    return event
  }

  /**
   * The format a category is drawn in, falling back to the tournament's.
   *
   * `categories` is an optional dependency, so a caller that did not supply it
   * gets the tournament's format — which is exactly the behaviour that existed
   * before formats could differ per category, and is right for the
   * category-less path where `categoryId` is null or undefined anyway.
   */
  async function resolveCategoryFormat(
    categoryId: string | null | undefined,
    tournamentFormat: TournamentFormat
  ): Promise<TournamentFormat> {
    if (!categoryId || !categories) return tournamentFormat
    const category = await categories.findById(categoryId)
    return resolveFormat(category, tournamentFormat)
  }

  /**
   * When this draw was frozen, or null if it is still the organiser's to redraw.
   *
   * Goes through `resolveBracketLock` so the category's own lock and the
   * category-less tournament's cannot disagree — the same contract
   * `resolveFormat` and `resolveMatchType` already use across these two tables.
   */
  async function lockedAtFor(
    tournamentId: string,
    categoryId: string | null | undefined,
    tournamentLockedAt: string | null
  ): Promise<string | null> {
    if (!categoryId || !categories) return tournamentLockedAt
    const category = await categories.findById(categoryId)
    return resolveBracketLock(category, tournamentLockedAt)
  }

  /** Whether this player may redraw and freeze this tournament's draws. */
  async function isOrganizer(playerId: string | null | undefined, eventId: string) {
    if (!playerId) return false
    const event = await events.findById(eventId)
    return !!event && event.created_by_player_id === playerId
  }

  /**
   * The read, as a closure rather than a method on the returned object, so that
   * lock and unlock can return the fresh draw without `this` — which is not
   * reliably bound on an object literal handed back from a factory.
   */
  async function readBracket(
    tournamentId: string,
    categoryId: string | null | undefined,
    viewerPlayerId: string | null | undefined
  ): Promise<BracketDto> {
    const tournament = await tournaments.findById(tournamentId)
    if (!tournament) {
      throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
    }

    const lockedAt = await lockedAtFor(tournamentId, categoryId, tournament.bracket_locked_at)
    const organiser = await isOrganizer(viewerPlayerId, tournament.event_id)

    /**
     * An unlocked draw is a working copy, not a publication.
     *
     * Generation is destructive and repeatable, so before this an organiser
     * trying three seedings was broadcasting all three to every entrant, and a
     * player refreshing the page watched their first-round opponent change
     * under them. The organiser still sees it all; everyone else gets the
     * placeholder shape and the entrant list until it is locked.
     */
    if (!organiser && categoryId !== undefined && !lockedAt) {
      return {
        tournament_id: tournamentId,
        category_id: categoryId ?? null,
        locked: false,
        rounds: []
      }
    }

    let bracketMatches = await brackets.findByTournamentId(tournamentId, categoryId)

    /**
     * The whole-tournament read is one request covering every category, so the
     * gate cannot be a single yes/no — the 3.5 draw may be locked while the 4.0
     * is still being seeded. Each match is kept or dropped by ITS OWN
     * category's lock, or the page would leak an unpublished draw through the
     * combined fetch it makes on every visit.
     */
    if (!organiser && categoryId === undefined) {
      const lockedCategoryIds = new Set<string>()
      if (categories) {
        for (const category of await categories.findByTournamentId(tournamentId)) {
          if (category.bracket_locked_at) lockedCategoryIds.add(category.id)
        }
      }
      bracketMatches = bracketMatches.filter((match) =>
        match.category_id === null
          ? tournament.bracket_locked_at !== null
          : lockedCategoryIds.has(match.category_id)
      )
    }
    // One extra query per bracket load, which is what turns registration ids
    // into names on the cards.
    const entrants = await attachRatings(
      await registrations.findByTournamentIdWithPlayers(tournamentId),
      tournament.match_type
    )
    const participants = indexParticipants(entrants)
    const scores = await indexScores(bracketMatches, entrants)
    const matchDtos = bracketMatches.map((match) => toBracketMatchDto(match, participants, scores))

    return {
      tournament_id: tournamentId,
      category_id: categoryId ?? null,
      locked: lockedAt !== null,
      rounds: groupByRound(matchDtos)
    }
  }

  /**
   * Entrant rows with the rating that actually applies to the draw they are in.
   *
   * The repository returns both of a player's ratings because which one counts
   * is a property of the CATEGORY — a doubles draw is contested in doubles
   * form. It used to hand back the singles rating unconditionally, so
   * `sortBySeed` ordered every doubles draw by everyone's singles standing and
   * each card printed a number belonging to a different discipline.
   *
   * One read of the categories covers a list spanning several draws, so this
   * stays two queries for a whole bracket however many categories it holds.
   */
  async function attachRatings<
    T extends {
      category_id: string | null
      singles_rating: number | null
      doubles_rating: number | null
    }
  >(
    rows: T[],
    tournamentMatchType: TournamentMatchType
  ): Promise<Array<T & { rating: number | null }>> {
    const byCategory = new Map<string, { match_type: TournamentMatchType | null }>()
    if (categories) {
      for (const categoryId of new Set(rows.map((row) => row.category_id).filter(Boolean))) {
        const category = await categories.findById(categoryId as string)
        if (category) byCategory.set(category.id, category)
      }
    }

    return rows.map((row) => ({
      ...row,
      rating: resolveEntrantRating(
        row,
        resolveMatchType(
          row.category_id ? (byCategory.get(row.category_id) ?? null) : null,
          tournamentMatchType
        )
      )
    }))
  }

  /**
   * Bracket match id -> oriented set scores.
   *
   * Two queries for a whole bracket regardless of its size: one for the
   * entrants (already loaded by the caller) and one for every linked match.
   */
  async function indexScores(
    bracketMatches: readonly BracketMatchRecord[],
    entrants: ReadonlyArray<{ id: string; player_id: string; partner_player_id: string | null }>
  ): Promise<Map<string, BracketMatchScoreDto[]>> {
    const out = new Map<string, BracketMatchScoreDto[]>()
    if (!matches) return out

    const matchIds = bracketMatches
      .map((match) => match.match_id)
      .filter((id): id is string => id !== null)
    if (!matchIds.length) return out

    const rows = await matches.findScoreRowsByMatchIds(matchIds)
    const rowByMatchId = new Map(rows.map((row) => [row.match_id, row]))

    // A doubles entrant is two people, and either of them may be the one the
    // match rows name, so both ids identify the slot.
    const playerIdsByRegistration = new Map<string, string[]>(
      entrants.map((entrant) => [
        entrant.id,
        entrant.partner_player_id
          ? [entrant.player_id, entrant.partner_player_id]
          : [entrant.player_id]
      ])
    )
    const idsFor = (registrationId: string | null) =>
      (registrationId && playerIdsByRegistration.get(registrationId)) || []

    for (const bracketMatch of bracketMatches) {
      if (!bracketMatch.match_id) continue
      const row = rowByMatchId.get(bracketMatch.match_id)
      if (!row) continue

      const oriented = orientScores(
        row,
        idsFor(bracketMatch.participant1_registration_id),
        idsFor(bracketMatch.participant2_registration_id)
      )
      if (oriented.length) out.set(bracketMatch.id, oriented)
    }

    return out
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
    async getBracket(tournamentId, categoryId, viewerPlayerId) {
      return readBracket(tournamentId, categoryId, viewerPlayerId)
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

      // Confirmed only (F-23). A pending registration is awaiting the
      // organiser's approval and does not hold a place — which is what the
      // vacancy counts on the tournament page already assume. Including them
      // here meant a category could read "full" while the bracket contained
      // people nobody had approved.
      const allRegs = await attachRatings(
        await registrations.findByTournamentIdWithPlayers(tournamentId),
        tournament.match_type
      )
      const inCategory = allRegs.filter((r) =>
        categoryId === undefined ? true : r.category_id === categoryId
      )
      // One read of the category covers the lock, the capacity and the format
      // below, all three of which are properties of the category being drawn.
      const category = categoryId && categories ? await categories.findById(categoryId) : null

      // A locked draw is final. Regenerating one would reshuffle players who
      // have already been told who they play, and orphan any result recorded
      // against it.
      const lockedAt = resolveBracketLock(category, tournament.bracket_locked_at)
      if (lockedAt) {
        throw new BracketServiceError(
          409,
          'BRACKET_LOCKED',
          'This draw is locked. Unlock it first if it really needs redrawing.'
        )
      }

      const confirmedRegs = sortBySeed(inCategory.filter((r) => r.status === 'confirmed'))

      /**
       * Draw a full category, not a partial one.
       *
       * Generating at 6 of 16 produced a three-round draw that the next two
       * entrants could not be added to — the only way back was to regenerate,
       * which is exactly the destructive operation this is trying to make rare.
       * An organiser who wants to start early lowers the capacity in Settings,
       * which is a decision with a number attached rather than an accident.
       *
       * A category with no stated capacity keeps the old rule: two is enough.
       */
      const capacity = category?.max_participants ?? null
      if (capacity !== null && confirmedRegs.length < capacity) {
        const short = capacity - confirmedRegs.length
        const pendingCount = inCategory.filter((r) => r.status === 'pending').length
        throw new BracketServiceError(
          409,
          'CATEGORY_NOT_FULL',
          `This category has ${confirmedRegs.length} of ${capacity} entries. ` +
            (pendingCount > 0
              ? `Approve ${pendingCount === 1 ? 'the entry' : 'the entries'} still waiting, or `
              : `Wait for ${short} more, or `) +
            `lower the size in Settings to draw it now.`
        )
      }

      if (confirmedRegs.length < 2) {
        const pendingCount = inCategory.filter((r) => r.status === 'pending').length
        throw new BracketServiceError(
          400,
          'INSUFFICIENT_PARTICIPANTS',
          pendingCount > 0
            ? `At least 2 confirmed registrations are required to generate a bracket; ` +
                `${confirmedRegs.length} confirmed, ${pendingCount} still awaiting approval.`
            : 'At least 2 participants are required to generate a bracket.'
        )
      }

      // Only wipe this category's own bracket — other categories' brackets in the same
      // tournament must survive regenerating one of them.
      await brackets.deleteByTournamentId(tournamentId, categoryId)

      const registrationIds = confirmedRegs.map((r) => r.id)
      let bracketMatches: NewBracketMatch[]

      // The CATEGORY's format, not the tournament's. One weekend runs "Open
      // Singles" as a round robin and "4.5 Doubles" as a knockout, and the
      // tournament's value is only the default a category inherited when it was
      // created.
      const format = resolveFormat(category, tournament.format)

      switch (format) {
        case 'double_elimination':
          bracketMatches = generateDoubleEliminationBracket(
            tournamentId,
            registrationIds,
            categoryId ?? null
          )
          break
        case 'round_robin':
          bracketMatches = generateRoundRobinBracket(
            tournamentId,
            registrationIds,
            categoryId ?? null
          )
          break
        case 'round_robin_single_elimination':
          bracketMatches = generateRoundRobinSingleEliminationBracket(
            tournamentId,
            registrationIds,
            categoryId ?? null
          )
          break
        case 'round_robin_double_elimination':
          bracketMatches = generateRoundRobinDoubleEliminationBracket(
            tournamentId,
            registrationIds,
            categoryId ?? null
          )
          break
        case 'single_elimination':
        default:
          bracketMatches = generateSingleEliminationBracket(
            tournamentId,
            registrationIds,
            categoryId ?? null
          )
          break
      }
      const created = await brackets.createMany(bracketMatches)
      const participants = indexParticipants(confirmedRegs)
      const matchDtos = created.map((match) => toBracketMatchDto(match, participants))

      return {
        tournament_id: tournamentId,
        category_id: categoryId ?? null,
        locked: lockedAt !== null,
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
      const resolvedFormat = await resolveCategoryFormat(
        bracketMatch.category_id,
        tournament.format
      )
      await advanceWinner(updated, resolvedFormat)
      // The other half of double elimination. Order matters: the winner takes
      // its slot first, so a match feeding both sides of one target cannot have
      // the loser land in the winner place.
      await routeLoser(updated, resolvedFormat)
      return toBracketMatchDto(updated)
    },

    async startBracketMatch(playerId, bracketMatchId) {
      const bracketMatch = await brackets.findById(bracketMatchId)
      if (!bracketMatch) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Bracket match not found.')
      }

      const tournament = await tournaments.findById(bracketMatch.tournament_id)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }
      await assertEventOrganizer(playerId, tournament.event_id)

      if (bracketMatch.winner_registration_id) {
        throw new BracketServiceError(409, 'ALREADY_DECIDED', 'That match already has a result.')
      }
      if (
        !bracketMatch.participant1_registration_id ||
        !bracketMatch.participant2_registration_id
      ) {
        throw new BracketServiceError(
          409,
          'SLOTS_NOT_FILLED',
          'Both places have to be filled before this match can start.'
        )
      }

      const started = await brackets.setLiveScore(bracketMatchId, {
        started_at: new Date().toISOString(),
        // 0-0 rather than null, so the live view has something to render the
        // moment the match goes live.
        live_score: [{ game_number: 1, team1_score: 0, team2_score: 0 }],
        live_score_updated_at: new Date().toISOString()
      })

      return toBracketMatchDto(started)
    },

    async updateBracketLiveScore(playerId, bracketMatchId, scores) {
      const bracketMatch = await brackets.findById(bracketMatchId)
      if (!bracketMatch) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Bracket match not found.')
      }

      const tournament = await tournaments.findById(bracketMatch.tournament_id)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }
      await assertEventOrganizer(playerId, tournament.event_id)

      if (!bracketMatch.started_at) {
        throw new BracketServiceError(
          409,
          'NOT_STARTED',
          'Start the match before entering a score.'
        )
      }
      if (bracketMatch.winner_registration_id) {
        throw new BracketServiceError(409, 'ALREADY_DECIDED', 'That match is finished.')
      }

      for (const game of scores) {
        if (
          !Number.isInteger(game.team1_score) ||
          !Number.isInteger(game.team2_score) ||
          game.team1_score < 0 ||
          game.team2_score < 0
        ) {
          throw new BracketServiceError(400, 'VALIDATION_ERROR', 'Scores must be whole numbers.')
        }
      }

      // No winning-score rule here on purpose. A live score is a running
      // tally, not a result: 11-9 is as valid mid-game as 3-2, and the format
      // is a match-submission concern. The final score is validated when the
      // result is actually recorded.
      const updated = await brackets.setLiveScore(bracketMatchId, {
        live_score: scores,
        live_score_updated_at: new Date().toISOString()
      })

      return toBracketMatchDto(updated)
    },

    async recordMatchResult(playerId, bracketMatchId, input) {
      if (!matches) {
        throw new BracketServiceError(
          500,
          'INTERNAL_ERROR',
          'Cannot record a result without the match repository.'
        )
      }

      const bracketMatch = await brackets.findById(bracketMatchId)
      if (!bracketMatch) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Bracket match not found.')
      }

      const tournament = await tournaments.findById(bracketMatch.tournament_id)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }

      await assertEventOrganizer(playerId, tournament.event_id)

      /**
       * Results go against a locked draw only.
       *
       * Recording into an unlocked one means recording into something the
       * organiser may still redraw — and a regenerate deletes the bracket rows,
       * orphaning the `matches` they linked to while leaving the ratings those
       * matches produced in place. Locking first is what makes the draw the
       * stable thing a result can attach to.
       */
      const lockedAt = await lockedAtFor(
        bracketMatch.tournament_id,
        bracketMatch.category_id,
        tournament.bracket_locked_at
      )
      if (!lockedAt) {
        throw new BracketServiceError(
          409,
          'BRACKET_NOT_LOCKED',
          'Lock the draw before recording results — an unlocked draw can still be redrawn.'
        )
      }

      // A slot with an empty side has nothing to record. This catches both a
      // bye and a match whose feeder has not finished.
      if (
        !bracketMatch.participant1_registration_id ||
        !bracketMatch.participant2_registration_id
      ) {
        throw new BracketServiceError(
          409,
          'MATCH_NOT_PLAYABLE',
          'Both entrants must be decided before a result can be recorded.'
        )
      }

      // Re-recording would strand the match already linked here and would need
      // the advanced winner pulled back out of the next round. Refuse rather
      // than half-undo it.
      if (bracketMatch.match_id) {
        throw new BracketServiceError(
          409,
          'RESULT_ALREADY_RECORDED',
          'A result has already been recorded for this match.'
        )
      }

      assertWinnerIsAParticipant(bracketMatch, input.winner_registration_id)
      assertScoresUsable(input.scores)

      const [entrant1, entrant2] = await Promise.all([
        registrations.findById(bracketMatch.participant1_registration_id),
        registrations.findById(bracketMatch.participant2_registration_id)
      ])
      if (!entrant1 || !entrant2) {
        throw new BracketServiceError(
          404,
          'NOT_FOUND',
          'An entrant in this match no longer exists.'
        )
      }

      // participant1 becomes team 1. Fixing the mapping at the point of writing
      // is what makes reading it back unambiguous.
      const participants = [
        { player_id: entrant1.player_id, team_number: 1 as const },
        ...(entrant1.partner_player_id
          ? [{ player_id: entrant1.partner_player_id, team_number: 1 as const }]
          : []),
        { player_id: entrant2.player_id, team_number: 2 as const },
        ...(entrant2.partner_player_id
          ? [{ player_id: entrant2.partner_player_id, team_number: 2 as const }]
          : [])
      ]

      // A tournament can run a singles draw and a doubles draw at once, and
      // the match this creates feeds a player's record — stamping it with the
      // tournament's type would mislabel one of them.
      const category =
        bracketMatch.category_id && categories
          ? await categories.findById(bracketMatch.category_id)
          : null

      const match = await matches.create(
        {
          event_id: tournament.event_id,
          match_type: resolveMatchType(category, tournament.match_type),
          venue: null,
          played_at: new Date().toISOString(),
          participants,
          scores: input.scores.map((set) => ({
            set_number: set.set_number,
            team1_score: set.participant1_score,
            team2_score: set.participant2_score
          }))
        },
        playerId
      )

      // An organiser writing down a draw result IS the verification. Asking the
      // pair who just lost to confirm the bracket would be backwards, and a
      // tournament result that sits unverified never reaches a player's record.
      await matches.updateMatchStatus(match.id, 'verified', new Date().toISOString())

      const updated = await brackets.update(bracketMatchId, {
        match_id: match.id,
        winner_registration_id: input.winner_registration_id,
        status: 'completed'
      })

      // The match is decided, so the running score is history. Cleared rather
      // than left behind: `is_live` is derived from started_at plus the absence
      // of a winner, and a stale live_score would still render on the card.
      await brackets.setLiveScore(bracketMatchId, {
        live_score: null,
        live_score_updated_at: null,
        started_at: null
      })
      const recordedFormat = await resolveCategoryFormat(
        bracketMatch.category_id,
        tournament.format
      )
      await advanceWinner(updated, recordedFormat)
      // Recording a real result is the main path into the bracket, so the
      // losers side has to be routed here too - not only from the organiser
      // override in updateBracketMatch.
      await routeLoser(updated, recordedFormat)
      return toBracketMatchDto(updated)
    },

    async undoBracket(playerId, tournamentId, categoryId) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }
      await assertEventOrganizer(playerId, tournament.event_id)

      const category = categoryId && categories ? await categories.findById(categoryId) : null
      if (resolveBracketLock(category, tournament.bracket_locked_at)) {
        throw new BracketServiceError(
          409,
          'BRACKET_LOCKED',
          'This draw is locked. Unlock it first if it really needs removing.'
        )
      }

      /**
       * A played draw is not undoable.
       *
       * `bracket_matches` rows are deleted here, but the `matches` they point at
       * are not — they carry verified results that have already moved people's
       * ratings, and deleting a rating-bearing record to tidy up a draw would be
       * the wrong trade. Refusing keeps the two consistent. (Regenerating had
       * this same hole and silently orphaned those rows; it now refuses too, via
       * the lock, because a draw with results is necessarily locked.)
       */
      const played = await brackets.countRecordedResults(tournamentId, categoryId ?? null)
      if (played > 0) {
        throw new BracketServiceError(
          409,
          'RESULTS_RECORDED',
          `${played} ${played === 1 ? 'result has' : 'results have'} already been recorded in this draw, so it cannot be removed.`
        )
      }

      await brackets.deleteByTournamentId(tournamentId, categoryId)
    },

    async lockBracket(playerId, tournamentId, categoryId) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }
      await assertEventOrganizer(playerId, tournament.event_id)

      // Nothing to publish. Locking an empty draw would tell players it is
      // final while showing them nothing.
      const existing = await brackets.findByTournamentId(tournamentId, categoryId)
      if (!existing.length) {
        throw new BracketServiceError(409, 'NO_BRACKET', 'Generate the draw before locking it.')
      }

      if (categoryId && categories) {
        await categories.setBracketLock(categoryId, playerId)
      } else {
        await tournaments.setBracketLock(tournamentId, playerId)
      }

      return readBracket(tournamentId, categoryId, playerId)
    },

    async unlockBracket(playerId, tournamentId, categoryId) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new BracketServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }
      await assertEventOrganizer(playerId, tournament.event_id)

      // Once a result exists the draw is part of the record of what happened,
      // and reopening it would invite a redraw that strands those matches.
      const played = await brackets.countRecordedResults(tournamentId, categoryId ?? null)
      if (played > 0) {
        throw new BracketServiceError(
          409,
          'RESULTS_RECORDED',
          `${played} ${played === 1 ? 'result has' : 'results have'} been recorded, so this draw can no longer be reopened.`
        )
      }

      if (categoryId && categories) {
        await categories.setBracketLock(categoryId, null)
      } else {
        await tournaments.setBracketLock(tournamentId, null)
      }

      return readBracket(tournamentId, categoryId, playerId)
    }
  }

  /**
   * A result needs at least one set, and a set is two whole non-negative
   * numbers. Deliberately does NOT insist the declared winner won more sets:
   * a retirement or a walkover is a real outcome the draw has to be able to
   * record.
   */
  function assertScoresUsable(scores: RecordBracketResultInput['scores']) {
    if (!scores.length) {
      throw new BracketServiceError(400, 'VALIDATION_ERROR', 'Record at least one set.')
    }

    const seen = new Set<number>()
    for (const set of scores) {
      if (!Number.isInteger(set.set_number) || set.set_number < 1) {
        throw new BracketServiceError(400, 'VALIDATION_ERROR', 'Set numbers start at 1.')
      }
      if (seen.has(set.set_number)) {
        throw new BracketServiceError(
          400,
          'VALIDATION_ERROR',
          `Set ${set.set_number} was given twice.`
        )
      }
      seen.add(set.set_number)

      for (const value of [set.participant1_score, set.participant2_score]) {
        if (!Number.isInteger(value) || value < 0) {
          throw new BracketServiceError(
            400,
            'VALIDATION_ERROR',
            'A game score must be a whole number of zero or more.'
          )
        }
      }
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
   *  - knockout rounds only: the winners side of single and double elimination
   *    (rounds below the 10 offset), and the playoff rounds of the two staged
   *    formats (the 50 offset). A pure round robin numbers its rounds from 1
   *    like a knockout does, so the FORMAT still has to be consulted — routing
   *    round 1 into round 2 of a round robin would overwrite a real fixture;
   *  - pool rounds have no successor of their own. What follows a pool is the
   *    playoff draw, and that is seeded in one go by `seedPlayoffsFromPools`
   *    once the last pool match is decided;
   *  - the losers bracket (100+) and grand final (200) are NOT routed. Correct
   *    loser placement depends on the round-by-round drop pattern, which the
   *    current generator only approximates, and a wrong route is worse than an
   *    empty one. Tracked as a backlog item; the winners side still advances.
   */
  async function advanceWinner(match: BracketMatchRecord, format: TournamentFormat) {
    if (format === 'round_robin') return
    if (!match.winner_registration_id) return
    if (match.status !== 'completed' && match.status !== 'bye') return

    // A pool result may have completed the group stage, which is what fills the
    // playoff draw. Nothing else follows a pool match.
    if (isPoolRound(match.round)) {
      await seedPlayoffsFromPools(match, format)
      return
    }

    const siblings = await brackets.findByTournamentId(
      match.tournament_id,
      match.category_id ?? undefined
    )

    // The decider settles it; nothing follows that.
    if (match.round === GRAND_FINAL_RESET_ROUND) return

    if (match.round === GRAND_FINAL_ROUND) {
      await seedGrandFinalReset(match, siblings)
      return
    }

    const next = isLosersRound(match.round)
      ? nextLosersSlot(match, siblings)
      : nextWinnersSlot(match, siblings)

    if (!next) return // the final, or a round with nothing after it

    const target = siblings.find((m) => m.round === next.round && m.position === next.position)
    if (!target) return

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

  /**
   * Sets up the decider, but only when the grand final failed to settle things.
   *
   * Slot 1 of the grand final holds the winners finalist, who arrived unbeaten.
   * If they win, the title is theirs and the decider stays empty forever. If
   * the losers-bracket entrant wins, both now have exactly one defeat and the
   * decider is played with the same two people.
   */
  async function seedGrandFinalReset(match: BracketMatchRecord, siblings: BracketMatchRecord[]) {
    const reset = siblings.find((m) => m.round === GRAND_FINAL_RESET_ROUND)
    if (!reset) return // an older draw, generated before the decider existed

    // The unbeaten side won: no decider is needed, and any half-seeded one
    // from a corrected result has to be cleared rather than left standing.
    if (match.winner_registration_id === match.participant1_registration_id) {
      if (reset.participant1_registration_id || reset.participant2_registration_id) {
        await brackets.setLiveScore(reset.id, { live_score: null, started_at: null })
      }
      return
    }

    if (!match.participant1_registration_id || !match.participant2_registration_id) return
    if (reset.participant1_registration_id === match.participant1_registration_id) return

    await brackets.setParticipant(reset.id, 1, match.participant1_registration_id, 'pending')
    await brackets.setParticipant(reset.id, 2, match.participant2_registration_id, 'ready')
  }

  /**
   * Where a winners-bracket winner goes next.
   *
   * Ordinarily the next winners round. The exception is the last winners round
   * of a double elimination: its winner goes to the grand final, and until now
   * nextSlotFor pointed at a round that does not exist, so the target came back
   * undefined and the code treated the winners final as "the final" - leaving
   * the grand final permanently empty on one side.
   */
  function nextWinnersSlot(
    match: BracketMatchRecord,
    siblings: BracketMatchRecord[]
  ): { round: number; position: number; slot: 1 | 2 } | null {
    const plain = nextSlotFor(match.round, match.position)
    if (siblings.some((m) => m.round === plain.round && m.position === plain.position)) {
      return plain
    }

    // No next winners round. If there is a grand final, this was the winners
    // final and its winner takes slot 1.
    if (siblings.some((m) => m.round === GRAND_FINAL_ROUND)) {
      return { round: GRAND_FINAL_ROUND, position: 1, slot: 1 }
    }

    return null
  }

  /**
   * Where a losers-bracket winner goes next.
   *
   * The losers bracket alternates between two kinds of round, which is why a
   * single "round + 1, position / 2" rule cannot describe it:
   *
   *   - a MINOR round, where the survivors of the previous losers round play
   *     each other and the field halves;
   *   - a MAJOR round, the same size as the one before it, where each survivor
   *     meets a player just knocked out of the winners bracket.
   *
   * Rather than recompute the generator arithmetic (and risk the two drifting
   * the moment either changes), this reads the ACTUAL match counts of the two
   * rounds and picks the mapping that fits: same size means one-to-one into
   * slot 1, half the size means two-into-one.
   *
   * Slot 1 by convention for the player coming up the losers bracket; slot 2 is
   * reserved for the winners-bracket dropdown, so the card always reads
   * "survivor vs the person who just lost".
   */
  function nextLosersSlot(
    match: BracketMatchRecord,
    siblings: BracketMatchRecord[]
  ): { round: number; position: number; slot: 1 | 2 } | null {
    const nextRound = match.round + 1

    // Past the end of the losers bracket: the survivor has earned the grand
    // final, and takes the side the winners finalist did not.
    if (nextRound >= GRAND_FINAL_ROUND || !siblings.some((m) => m.round === nextRound)) {
      return siblings.some((m) => m.round === GRAND_FINAL_ROUND)
        ? { round: GRAND_FINAL_ROUND, position: 1, slot: 2 }
        : null
    }

    const here = siblings.filter((m) => m.round === match.round).length
    const there = siblings.filter((m) => m.round === nextRound).length

    if (there === here) {
      // Major round: one-to-one, and the dropdown fills the other side.
      return { round: nextRound, position: match.position, slot: 1 }
    }

    // Minor round: two matches feed one.
    return {
      round: nextRound,
      position: Math.ceil(match.position / 2),
      slot: match.position % 2 === 1 ? 1 : 2
    }
  }

  /**
   * Sends the loser of a winners-bracket match down into the losers bracket.
   *
   * This is the half of double elimination that was missing entirely: winners
   * advanced, losers simply vanished, and every losers-bracket match stayed a
   * pair of TBDs that could never be filled. A "double elimination" draw was in
   * practice a single elimination with an unreachable second half.
   *
   * The mapping mirrors the generator:
   *   - round 1 losers fill losers round 1, two winners-matches per slot;
   *   - round r losers (r >= 2) drop into losers round 2r-2, one-to-one, into
   *     slot 2 (slot 1 belongs to whoever came up the losers bracket).
   *
   * Deliberately does NOT model a grand-final reset. A losers-bracket player
   * winning the grand final has only lost once, so a strict double elimination
   * plays a decider - but the generator emits a single grand-final match, and
   * inventing a round the draw does not contain would put a fixture on the
   * schedule that no view knows how to render. Recorded as a known limitation
   * rather than half-built.
   */
  async function routeLoser(match: BracketMatchRecord, format: TournamentFormat) {
    if (format !== 'double_elimination' && format !== 'round_robin_double_elimination') return
    if (!match.winner_registration_id) return
    if (match.status !== 'completed' && match.status !== 'bye') return

    // Only the winners bracket drops players down. A losers-bracket loser is
    // out, which is the entire point of the format.
    if (match.round >= LOSERS_ROUND_OFFSET || isPoolRound(match.round)) return

    const loserId =
      match.winner_registration_id === match.participant1_registration_id
        ? match.participant2_registration_id
        : match.participant1_registration_id

    // A bye has no loser to send anywhere.
    if (!loserId) return

    const siblings = await brackets.findByTournamentId(
      match.tournament_id,
      match.category_id ?? undefined
    )

    const target =
      match.round === 1
        ? findLosersTarget(siblings, LOSERS_ROUND_OFFSET + 1, Math.ceil(match.position / 2))
        : findLosersTarget(siblings, LOSERS_ROUND_OFFSET + (match.round * 2 - 2), match.position)

    if (!target) return

    // Round 1 sends two losers into one match, so they take slot 1 and slot 2
    // by parity. Later rounds always take slot 2.
    const slot: 1 | 2 = match.round === 1 ? (match.position % 2 === 1 ? 1 : 2) : 2

    const occupant =
      slot === 1 ? target.participant1_registration_id : target.participant2_registration_id
    if (occupant === loserId) return // already routed

    const other =
      slot === 1 ? target.participant2_registration_id : target.participant1_registration_id

    await brackets.setParticipant(target.id, slot, loserId, other ? 'ready' : 'pending')
  }

  function findLosersTarget(
    siblings: BracketMatchRecord[],
    round: number,
    position: number
  ): BracketMatchRecord | undefined {
    return siblings.find((m) => m.round === round && m.position === position)
  }

  /**
   * Fills the first playoff round once every pool match has a result.
   *
   * The two staged formats draw their pools and their (empty) playoff skeleton
   * in the same pass, and until now nothing ever joined the two: an organiser
   * could play every pool fixture and the playoff draw stayed a column of TBDs
   * that could never be filled. This is the join.
   *
   * Idempotent by inspection — if any first-playoff slot is already occupied
   * the draw has been seeded and this returns — so recording a result in an
   * already-finished group stage (a correction, say) does not reshuffle a
   * playoff that may already be under way.
   */
  async function seedPlayoffsFromPools(match: BracketMatchRecord, format: TournamentFormat) {
    if (!hasGroupStage(format)) return

    const siblings = await brackets.findByTournamentId(
      match.tournament_id,
      match.category_id ?? undefined
    )

    const poolMatches = siblings.filter((m) => isPoolRound(m.round))
    if (!poolMatches.length) return
    // One unplayed fixture and the tables are not final, so nothing qualifies.
    if (!poolMatches.every((m) => m.status === 'completed' || m.status === 'bye')) return

    const firstPlayoffRound = PLAYOFF_ROUND_OFFSET + 1
    const playoffSlots = siblings
      .filter((m) => m.round === firstPlayoffRound)
      .sort((a, b) => a.position - b.position)
    if (!playoffSlots.length) return
    if (
      playoffSlots.some(
        (m) => m.participant1_registration_id !== null || m.participant2_registration_id !== null
      )
    ) {
      return
    }

    const qualifiers = qualifiersFromPools(poolMatches)
    if (qualifiers.length < 2) return

    // Reuse the knockout layout so a playoff draw is allocated exactly like any
    // other first round: byes to the top qualifiers, then pairs.
    const layout = buildFirstRound(
      match.tournament_id,
      qualifiers,
      playoffSlots.length * 2,
      match.category_id
    )

    for (const drawn of layout) {
      const target = playoffSlots[drawn.position - 1]
      if (!target) continue

      if (drawn.participant1_registration_id) {
        await brackets.setParticipant(target.id, 1, drawn.participant1_registration_id, 'pending')
      }
      if (drawn.participant2_registration_id) {
        await brackets.setParticipant(target.id, 2, drawn.participant2_registration_id, 'pending')
      }

      const seeded = await brackets.update(target.id, {
        status: drawn.status,
        winner_registration_id: drawn.winner_registration_id
      })

      // A qualifier who drew a bye is already through, so walk them on rather
      // than leaving the next playoff round with a slot nothing will ever fill.
      if (seeded.status === 'bye') await advanceWinner(seeded, format)
    }
  }
}

/**
 * Who comes out of the group stage, best first.
 *
 * PRODUCT DECISION, not a derived fact: the top two of every pool qualify, and
 * they are ordered wins descending, then point difference, then head-to-head,
 * with the registration id settling the rest so the draw does not wander
 * between calls. Nothing in the specification decided this — see the ADR — so
 * it lives in one exported function that a different rule can replace without
 * touching the generator or the advancement.
 *
 * Byes are ignored the way `computeCategoryStandings` ignores them: a bye is
 * the absence of an opponent, and counting it would hand a free win to whoever
 * happened to be short a fixture.
 */
interface PoolRecord {
  registration_id: string
  wins: number
  losses: number
  pointDiff: number
  beat: Set<string>
}

export function qualifiersFromPools(poolMatches: readonly BracketMatchRecord[]): string[] {
  const byPool = new Map<number, BracketMatchRecord[]>()
  for (const match of poolMatches) {
    const list = byPool.get(match.round) ?? []
    list.push(match)
    byPool.set(match.round, list)
  }

  const winners: PoolRecord[] = []
  const runnersUp: PoolRecord[] = []

  for (const round of [...byPool.keys()].sort((a, b) => a - b)) {
    const table = poolTable(byPool.get(round)!)
    table.slice(0, QUALIFIERS_PER_POOL).forEach((entry, place) => {
      if (place === 0) winners.push(entry)
      else runnersUp.push(entry)
    })
  }

  // Pool winners ahead of every runner-up, so the two qualifiers out of one
  // pool land on opposite halves of the playoff draw rather than meeting again
  // in the first round.
  return [...winners.sort(comparePoolRecords), ...runnersUp.sort(comparePoolRecords)].map(
    (entry) => entry.registration_id
  )
}

function comparePoolRecords(a: PoolRecord, b: PoolRecord): number {
  if (a.wins !== b.wins) return b.wins - a.wins
  if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff
  // Head-to-head, and only when they actually met.
  if (a.beat.has(b.registration_id) && !b.beat.has(a.registration_id)) return -1
  if (b.beat.has(a.registration_id) && !a.beat.has(b.registration_id)) return 1
  return a.registration_id.localeCompare(b.registration_id)
}

/**
 * One pool's table.
 *
 * Point difference comes from the bracket rows alone, which carry no scores —
 * so it is zero here and the comparator falls through to head-to-head. The
 * field exists because the rule names it and because the score-aware variant
 * (`computeCategoryStandings` over BracketMatchDto) can populate it without the
 * comparator changing.
 */
function poolTable(matches: readonly BracketMatchRecord[]): PoolRecord[] {
  const records = new Map<string, PoolRecord>()
  const ensure = (registrationId: string) => {
    let entry = records.get(registrationId)
    if (!entry) {
      entry = { registration_id: registrationId, wins: 0, losses: 0, pointDiff: 0, beat: new Set() }
      records.set(registrationId, entry)
    }
    return entry
  }

  for (const match of matches) {
    const slots = [match.participant1_registration_id, match.participant2_registration_id].filter(
      (id): id is string => Boolean(id)
    )
    for (const id of slots) ensure(id)

    if (match.status === 'bye') continue
    const winner = match.winner_registration_id
    if (!winner || slots.length < 2) continue

    for (const id of slots) {
      const record = ensure(id)
      if (id === winner) {
        record.wins++
        record.beat.add(slots.find((other) => other !== id)!)
      } else {
        record.losses++
      }
    }
  }

  return [...records.values()].sort(comparePoolRecords)
}

/**
 * Seed order: strongest first, unrated last, `registered_at` breaking ties.
 *
 * `buildFirstRound` allocates byes "to the top seeds first" — an assumption
 * nothing satisfied, because the list arrived in whatever order the repository
 * returned. Sorting here is what makes that comment true. Unrated players go
 * last rather than first: a bye is an advantage, and handing it to someone with
 * no record over someone with a proven one is the wrong way round.
 */
/** Registration id -> display fields, the key a bracket slot actually holds. */
function indexParticipants(
  entrants: ReadonlyArray<{
    id: string
    display_name: string
    rating: number | null
    partner_display_name: string | null
  }>
): Map<string, BracketParticipantDto> {
  return new Map(
    entrants.map((entrant) => [
      entrant.id,
      {
        registration_id: entrant.id,
        display_name: entrant.display_name,
        rating: entrant.rating,
        partner_display_name: entrant.partner_display_name
      }
    ])
  )
}

function sortBySeed<T extends { rating: number | null; registered_at: string }>(
  entrants: readonly T[]
): T[] {
  return [...entrants].sort((a, b) => {
    if (a.rating === null && b.rating === null)
      return a.registered_at.localeCompare(b.registered_at)
    if (a.rating === null) return 1
    if (b.rating === null) return -1
    if (a.rating !== b.rating) return b.rating - a.rating
    return a.registered_at.localeCompare(b.registered_at)
  })
}

type NewBracketMatch = import('../dto/bracket.dto').NewBracketMatch

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
    registrationIds,
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
    registrationIds,
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

  // The grand final, and the decider it may need.
  //
  // The reset exists in the draw from generation rather than being inserted
  // when it becomes necessary: a bracket is a fixed set of rows that views
  // render and organisers schedule, and materialising a fixture mid-tournament
  // would mean every reader had to cope with the shape changing underneath it.
  // It stays empty — and so renders as nothing — unless the losers-bracket
  // entrant wins the grand final.
  for (const round of [GRAND_FINAL_ROUND, GRAND_FINAL_RESET_ROUND]) {
    matches.push({
      tournament_id: tournamentId,
      round,
      position: 1,
      match_id: null,
      participant1_registration_id: null,
      participant2_registration_id: null,
      winner_registration_id: null,
      status: 'pending',
      scheduled_at: null,
      category_id: categoryId
    })
  }

  // Byes are propagated on the winners side only: a bye means nobody was
  // beaten, so there is no loser to drop into the losers bracket. Live results
  // route both ways - see advanceWinner and routeLoser.
  return propagateByes(matches)
}

function generateRoundRobinBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): NewBracketMatch[] {
  const n = registrationIds.length
  const matches: NewBracketMatch[] = []

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

/**
 * The round-robin group stage the two staged formats share.
 *
 * Pools are dealt round-robin style (entrant i into pool i % numPools) rather
 * than in blocks, so a seed-ordered field spreads its strength across the pools
 * instead of stacking the top four into pool A.
 *
 * Returns the fixtures and the pool count, because the caller sizes its playoff
 * draw from how many pools there are.
 */
function buildGroupStage(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null
): { matches: NewBracketMatch[]; numPools: number } {
  const n = registrationIds.length
  const matches: NewBracketMatch[] = []

  const numPools = n >= 8 ? Math.ceil(n / 4) : 2
  const pools: string[][] = Array.from({ length: numPools }, () => [])

  registrationIds.forEach((id, i) => {
    pools[i % numPools].push(id)
  })

  pools.forEach((pool, poolIndex) => {
    const poolRound = POOL_ROUND_OFFSET + poolIndex
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

  return { matches, numPools }
}

/** How many qualifiers the playoff draw has to hold. */
function playoffDrawSize(numPools: number): number {
  return nextPowerOfTwo(numPools * QUALIFIERS_PER_POOL)
}

/**
 * An empty knockout skeleton at a given round offset.
 *
 * The slots are filled later — by `seedPlayoffsFromPools` for round one and by
 * `advanceWinner` after that — so every row starts pending with both slots
 * null. Shared by the playoff halves of both staged formats.
 */
function buildEmptyKnockout(
  tournamentId: string,
  drawSize: number,
  roundOffset: number,
  categoryId: string | null
): NewBracketMatch[] {
  const matches: NewBracketMatch[] = []
  const numRounds = Math.log2(drawSize)

  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = drawSize / Math.pow(2, round)
    for (let position = 1; position <= matchesInRound; position++) {
      matches.push({
        tournament_id: tournamentId,
        round: roundOffset + round,
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

/**
 * Group stage then knockout. Stored as `pool_play` until
 * 031-tournament-format renamed the value to say what it does.
 */
function generateRoundRobinSingleEliminationBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): NewBracketMatch[] {
  const { matches, numPools } = buildGroupStage(tournamentId, registrationIds, categoryId)

  return [
    ...matches,
    ...buildEmptyKnockout(tournamentId, playoffDrawSize(numPools), PLAYOFF_ROUND_OFFSET, categoryId)
  ]
}

/**
 * Group stage then double-elimination playoffs.
 *
 * The same pools as the single-elimination variant, followed by the same three
 * pieces `generateDoubleEliminationBracket` lays out — a winners draw, a losers
 * draw, and a grand final — only sitting at the playoff offset so `phaseOf`
 * reads the whole thing as Pools → Playoffs → Losers → Grand Final without any
 * new phase vocabulary.
 *
 * Like the plain double elimination, the losers side is drawn but not routed:
 * see the note in advanceWinner.
 */
function generateRoundRobinDoubleEliminationBracket(
  tournamentId: string,
  registrationIds: string[],
  categoryId: string | null = null
): NewBracketMatch[] {
  const { matches, numPools } = buildGroupStage(tournamentId, registrationIds, categoryId)
  const drawSize = playoffDrawSize(numPools)
  const numWinnersRounds = Math.log2(drawSize)

  const losers: NewBracketMatch[] = []
  const numLosersRounds = (numWinnersRounds - 1) * 2

  for (let losersRound = 1; losersRound <= numLosersRounds; losersRound++) {
    const effectiveRound = Math.ceil(losersRound / 2)
    const matchesInRound = drawSize / Math.pow(2, effectiveRound + 1)
    for (let position = 1; position <= Math.max(1, matchesInRound); position++) {
      losers.push({
        tournament_id: tournamentId,
        round: LOSERS_ROUND_OFFSET + losersRound,
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

  return [
    ...matches,
    ...buildEmptyKnockout(tournamentId, drawSize, PLAYOFF_ROUND_OFFSET, categoryId),
    ...losers,
    {
      tournament_id: tournamentId,
      round: GRAND_FINAL_ROUND,
      position: 1,
      match_id: null,
      participant1_registration_id: null,
      participant2_registration_id: null,
      winner_registration_id: null,
      status: 'pending',
      scheduled_at: null,
      category_id: categoryId
    }
  ]
}
