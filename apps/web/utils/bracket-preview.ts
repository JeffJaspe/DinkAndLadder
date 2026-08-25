import type { BracketDto, BracketMatchDto } from '~/server/domains/event/dto/bracket.dto'
import type { TournamentFormat } from '~/server/domains/event/dto/tournament.dto'
import {
  GRAND_FINAL_ROUND,
  LOSERS_ROUND_OFFSET,
  PLAYOFF_ROUND_OFFSET,
  POOL_ROUND_OFFSET
} from '~/utils/bracket-rounds'
import { hasGroupStage } from '~/utils/tournament-formats'

/**
 * A draw that does not exist yet, drawn anyway.
 *
 * Before this, a category with no generated bracket showed a numbered list of
 * entrants and nothing else — so the shape of the event was invisible until an
 * organiser committed to generating it, and a category with two entrants in a
 * sixteen-player draw looked identical to one that was full.
 *
 * Every slot with nobody in it renders as TBD, which BracketMatchCard already
 * does for a real slot the draw has not reached. Nothing here is persisted and
 * nothing here is a prediction of who plays whom — see `PREVIEW_ORDER_NOTE`.
 */

/** Rounded up to a power of two, the way every knockout draw is sized. */
function nextPowerOfTwo(n: number): number {
  let power = 1
  while (power < n) power *= 2
  return power
}

/**
 * How big to draw the placeholder.
 *
 * A stated capacity is the honest answer — that is the draw the organiser
 * intends. Without one, the entrants are rounded up to a power of two, with a
 * floor of four: a two-slot draw is a single match with nothing to connect, and
 * showing that as "the picture of the tournament" defeats the point.
 */
export const MIN_PREVIEW_DRAW = 4

export function previewDrawSize(entrantCount: number, capacity: number | null): number {
  if (capacity && capacity >= 2) return nextPowerOfTwo(capacity)
  return nextPowerOfTwo(Math.max(entrantCount, MIN_PREVIEW_DRAW))
}

export interface PreviewEntrant {
  /** Registration id — what a real bracket slot holds. */
  id: string
  display_name: string
  rating: number | null
  partner_display_name: string | null
}

/**
 * The order entrants are placed into the placeholder.
 *
 * Registration order, deliberately, and NOT what `sortBySeed` in
 * bracket.service.ts will do when the draw is really generated (rating
 * descending, unrated last). The two disagree the moment the field is rated, so
 * the view says so rather than letting the placeholder read as a prediction.
 */
export const PREVIEW_ORDER_NOTE =
  'Entrants are shown in registration order. Generating the draw seeds by rating, strongest first.'

export function byRegistrationOrder<T extends { registered_at: string; id: string }>(
  entrants: readonly T[]
): T[] {
  return [...entrants].sort(
    (a, b) => a.registered_at.localeCompare(b.registered_at) || a.id.localeCompare(b.id)
  )
}

function emptyMatch(round: number, position: number, categoryId: string | null): BracketMatchDto {
  return {
    id: `preview-${round}-${position}`,
    tournament_id: 'preview',
    round,
    position,
    match_id: null,
    participant1_registration_id: null,
    participant2_registration_id: null,
    winner_registration_id: null,
    // Never 'ready' or 'completed': nothing here can be played, and a slot that
    // looked playable would invite an organiser to go looking for a button.
    status: 'pending',
    scheduled_at: null,
    category_id: categoryId,
    participant1: null,
    participant2: null,
    scores: []
  }
}

/** Puts an entrant, or nobody, into one side of a placeholder slot. */
function place(
  match: BracketMatchDto,
  side: 1 | 2,
  entrant: PreviewEntrant | undefined,
  categoryId: string | null
): void {
  if (!entrant) return
  const participant = {
    registration_id: entrant.id,
    display_name: entrant.display_name,
    rating: entrant.rating,
    partner_display_name: entrant.partner_display_name
  }
  if (side === 1) {
    match.participant1_registration_id = entrant.id
    match.participant1 = participant
  } else {
    match.participant2_registration_id = entrant.id
    match.participant2 = participant
  }
  match.category_id = categoryId
}

function knockoutRounds(
  slots: (PreviewEntrant | undefined)[],
  roundOffset: number,
  categoryId: string | null
): BracketDto['rounds'] {
  const drawSize = slots.length
  const rounds: BracketDto['rounds'] = []

  const first: BracketMatchDto[] = []
  for (let position = 1; position <= drawSize / 2; position++) {
    const match = emptyMatch(roundOffset + 1, position, categoryId)
    place(match, 1, slots[(position - 1) * 2], categoryId)
    place(match, 2, slots[(position - 1) * 2 + 1], categoryId)
    first.push(match)
  }
  rounds.push({ round: roundOffset + 1, matches: first })

  for (let round = 2; round <= Math.log2(drawSize); round++) {
    const matches: BracketMatchDto[] = []
    for (let position = 1; position <= drawSize / Math.pow(2, round); position++) {
      matches.push(emptyMatch(roundOffset + round, position, categoryId))
    }
    rounds.push({ round: roundOffset + round, matches })
  }

  return rounds
}

function roundRobinRounds(
  slots: (PreviewEntrant | undefined)[],
  categoryId: string | null
): BracketDto['rounds'] {
  // Every pairing, laid out as one round so the placeholder reads as a fixture
  // list rather than pretending to know a schedule.
  const matches: BracketMatchDto[] = []
  let position = 1
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const match = emptyMatch(1, position++, categoryId)
      place(match, 1, slots[i], categoryId)
      place(match, 2, slots[j], categoryId)
      matches.push(match)
    }
  }
  return matches.length ? [{ round: 1, matches }] : []
}

function poolRounds(
  slots: (PreviewEntrant | undefined)[],
  categoryId: string | null
): { rounds: BracketDto['rounds']; numPools: number } {
  // Mirrors buildGroupStage in bracket.service.ts, including the round-robin
  // deal, so the placeholder's pools are the pools that would be drawn.
  const n = slots.length
  const numPools = n >= 8 ? Math.ceil(n / 4) : 2
  const pools: (PreviewEntrant | undefined)[][] = Array.from({ length: numPools }, () => [])
  slots.forEach((entrant, i) => pools[i % numPools].push(entrant))

  const rounds: BracketDto['rounds'] = []
  pools.forEach((pool, poolIndex) => {
    const matches: BracketMatchDto[] = []
    let position = 1
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const match = emptyMatch(POOL_ROUND_OFFSET + poolIndex, position++, categoryId)
        place(match, 1, pool[i], categoryId)
        place(match, 2, pool[j], categoryId)
        matches.push(match)
      }
    }
    if (matches.length) rounds.push({ round: POOL_ROUND_OFFSET + poolIndex, matches })
  })

  return { rounds, numPools }
}

function losersRounds(drawSize: number, categoryId: string | null): BracketDto['rounds'] {
  const numWinnersRounds = Math.log2(drawSize)
  const rounds: BracketDto['rounds'] = []

  for (let losersRound = 1; losersRound <= (numWinnersRounds - 1) * 2; losersRound++) {
    const effective = Math.ceil(losersRound / 2)
    const count = Math.max(1, drawSize / Math.pow(2, effective + 1))
    const matches: BracketMatchDto[] = []
    for (let position = 1; position <= count; position++) {
      matches.push(emptyMatch(LOSERS_ROUND_OFFSET + losersRound, position, categoryId))
    }
    rounds.push({ round: LOSERS_ROUND_OFFSET + losersRound, matches })
  }

  return rounds
}

/**
 * The shape this category would be played in, with whoever has entered so far
 * placed into it and every remaining slot left as TBD.
 *
 * Round numbering matches the real generators exactly, so `phaseOf` classifies a
 * placeholder the same way it classifies a real draw and `CategoryMatchups`
 * renders both through the same components.
 */
export function buildPreviewBracket(
  format: TournamentFormat,
  entrants: readonly PreviewEntrant[],
  capacity: number | null,
  categoryId: string | null = null
): BracketDto | null {
  // A draw of nothing but TBD is an empty grid, not a picture of an event —
  // the caller has a better empty state for that.
  if (!entrants.length) return null

  const drawSize = previewDrawSize(entrants.length, capacity)
  const slots: (PreviewEntrant | undefined)[] = Array.from(
    { length: drawSize },
    (_, i) => entrants[i]
  )

  let rounds: BracketDto['rounds']

  if (format === 'round_robin') {
    rounds = roundRobinRounds(slots, categoryId)
  } else if (hasGroupStage(format)) {
    const { rounds: pools, numPools } = poolRounds(slots, categoryId)
    const playoffSize = nextPowerOfTwo(numPools * 2)
    rounds = [
      ...pools,
      ...knockoutRounds(
        Array.from({ length: playoffSize }, () => undefined),
        PLAYOFF_ROUND_OFFSET,
        categoryId
      )
    ]
    if (format === 'round_robin_double_elimination') {
      rounds = [
        ...rounds,
        ...losersRounds(playoffSize, categoryId),
        { round: GRAND_FINAL_ROUND, matches: [emptyMatch(GRAND_FINAL_ROUND, 1, categoryId)] }
      ]
    }
  } else {
    rounds = knockoutRounds(slots, 0, categoryId)
    if (format === 'double_elimination') {
      rounds = [
        ...rounds,
        ...losersRounds(drawSize, categoryId),
        { round: GRAND_FINAL_ROUND, matches: [emptyMatch(GRAND_FINAL_ROUND, 1, categoryId)] }
      ]
    }
  }

  if (!rounds.length) return null

  return { tournament_id: 'preview', category_id: categoryId, locked: false, rounds }
}
