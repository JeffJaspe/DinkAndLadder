import type { TournamentFormat } from '~/server/domains/event/dto/tournament.dto'

/**
 * The formats an organiser may choose, in the order they are offered, each with
 * the one line that explains it.
 *
 * One list, used by every screen that names a format: the picker on
 * create-event, the category summary, and the category edit form. Those three
 * previously carried their own copies — create-event listed four with hints,
 * CategoryInfo held a label-only map, and the two had already drifted (the page
 * before that offered `swiss`, which is not a format and would have been
 * rejected by the API).
 *
 * The description is not decoration. A player reading "Round Robin → Double
 * Elimination" has no way to know what they are entering; "Group stage then
 * double-elim playoffs" is the whole explanation, and it belongs at the point
 * of choice rather than in documentation nobody opens.
 */
export interface TournamentFormatOption {
  value: TournamentFormat
  label: string
  description: string
}

export const TOURNAMENT_FORMATS: readonly TournamentFormatOption[] = [
  {
    value: 'round_robin',
    label: 'Round Robin',
    description: 'Everyone plays everyone'
  },
  {
    value: 'single_elimination',
    label: 'Single Elimination',
    description: "One loss and you're out"
  },
  {
    value: 'double_elimination',
    label: 'Double Elimination',
    description: "Two losses and you're out"
  },
  {
    value: 'round_robin_single_elimination',
    label: 'Round Robin → Single Elimination',
    description: 'Group stage then knockout'
  },
  {
    value: 'round_robin_double_elimination',
    label: 'Round Robin → Double Elimination',
    description: 'Group stage then double-elim playoffs'
  }
] as const

export const TOURNAMENT_FORMAT_VALUES: readonly TournamentFormat[] = TOURNAMENT_FORMATS.map(
  (option) => option.value
)

const BY_VALUE = new Map(TOURNAMENT_FORMATS.map((option) => [option.value, option]))

export function isTournamentFormat(value: unknown): value is TournamentFormat {
  return typeof value === 'string' && BY_VALUE.has(value as TournamentFormat)
}

export function formatOption(value: TournamentFormat | null): TournamentFormatOption | null {
  return value ? (BY_VALUE.get(value) ?? null) : null
}

/**
 * Falls back to the raw stored value rather than rendering nothing: a row
 * written before a rename should still show something a human can act on.
 */
export function formatLabel(value: TournamentFormat | null): string {
  if (!value) return 'Not set'
  return BY_VALUE.get(value)?.label ?? value
}

export function formatDescription(value: TournamentFormat | null): string {
  return (value && BY_VALUE.get(value)?.description) ?? ''
}

/**
 * Whether the format opens with round-robin groups.
 *
 * The two staged formats draw pool rounds before their knockout, which is what
 * decides whether a view shows group tables at all — so the question is asked
 * here rather than by each caller matching on strings.
 */
export function hasGroupStage(value: TournamentFormat | null): boolean {
  return value === 'round_robin_single_elimination' || value === 'round_robin_double_elimination'
}

/** Whether the format ends in a knockout draw that can crown a champion. */
export function hasKnockoutStage(value: TournamentFormat | null): boolean {
  return value !== null && value !== 'round_robin'
}
