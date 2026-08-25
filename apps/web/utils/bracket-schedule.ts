import type {
  BracketDto,
  BracketMatchDto,
  BracketMatchScoreDto
} from '~/server/domains/event/dto/bracket.dto'

/**
 * Reading a draw as an order of play.
 *
 * The bracket is a shape; a schedule is that shape sorted by when it can
 * happen. Both the one-line "Up next" on a collapsed category card and the full
 * schedule inside an expanded one are derived from here, so the two can never
 * disagree about what is on next — which they would if each computed its own.
 *
 * Lifted out of CategoryOrderOfPlay.vue, where the same three groupings lived
 * as local computeds and the participant label was duplicated a third time.
 */

export interface ScheduleEntry {
  match: BracketMatchDto
  round: number
}

export interface SchedulePartition {
  /** Playable now: both slots filled, or already on court. */
  upNext: ScheduleEntry[]
  /** Waiting on a feeder result. */
  waiting: ScheduleEntry[]
  /** Decided, byes included. */
  done: ScheduleEntry[]
}

/** Every match in the draw, in the order the generator laid them out. */
export function flattenBracket(bracket: BracketDto | null): ScheduleEntry[] {
  return (bracket?.rounds ?? [])
    .flatMap((round) => round.matches.map((match) => ({ match, round: round.round })))
    .sort((a, b) => a.round - b.round || a.match.position - b.match.position)
}

export function partitionSchedule(bracket: BracketDto | null): SchedulePartition {
  const all = flattenBracket(bracket)
  return {
    upNext: all.filter((e) => e.match.status === 'ready' || e.match.status === 'in_progress'),
    waiting: all.filter((e) => e.match.status === 'pending'),
    done: all.filter((e) => e.match.status === 'completed' || e.match.status === 'bye')
  }
}

/**
 * The single match to put in front of everyone.
 *
 * A match already on court outranks one merely ready to start: it is the thing
 * actually happening, and pointing a player at a court that is still in use is
 * worse than pointing them at nothing.
 */
export function nextMatch(bracket: BracketDto | null): ScheduleEntry | null {
  const { upNext } = partitionSchedule(bracket)
  return upNext.find((e) => e.match.status === 'in_progress') ?? upNext[0] ?? null
}

/** "A. Cruz / M. Reyes", or "TBD" for a slot nothing has reached yet. */
export function participantLabel(match: BracketMatchDto, slot: 1 | 2): string {
  const participant = slot === 1 ? match.participant1 : match.participant2
  if (!participant) return 'TBD'
  return participant.partner_display_name
    ? `${participant.display_name} / ${participant.partner_display_name}`
    : participant.display_name
}

/** "A. Cruz vs J. Lim", or null when there is nothing to play. */
export function nextMatchLabel(bracket: BracketDto | null): string | null {
  const entry = nextMatch(bracket)
  if (!entry) return null
  return `${participantLabel(entry.match, 1)} vs ${participantLabel(entry.match, 2)}`
}

/** "11-9, 8-11, 11-6". Empty string when no sets were recorded. */
export function formatScoreLine(scores: readonly BracketMatchScoreDto[]): string {
  return [...scores]
    .sort((a, b) => a.set_number - b.set_number)
    .map((set) => `${set.participant1_score}-${set.participant2_score}`)
    .join(', ')
}

/**
 * Whether a category has played itself out.
 *
 * Not what unlocks standings — that is the organiser marking the category
 * complete, deliberately, because an abandoned draw should not publish a result
 * on its own. This is what tells the organiser the draw is ready to be closed.
 */
export function isDrawDecided(bracket: BracketDto | null): boolean {
  const all = flattenBracket(bracket)
  if (!all.length) return false
  return all.every((e) => e.match.status === 'completed' || e.match.status === 'bye')
}
