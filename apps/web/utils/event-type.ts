import type { EventDto, EventType } from '~/server/domains/event/dto/event.dto'

/**
 * What kind of event this is, said the way a player would say it.
 *
 * The stored `event_type` encodes two separate things at once — the shape of
 * the event (open play, tournament) and whether it counts for rating (casual,
 * ranked) — so `open_ranked` alone answers neither question legibly on a card.
 * These helpers split it back apart.
 */

/** The headline kind, for the big label on a thumbnail. */
export function eventKindLabel(eventType: EventType | string): string {
  switch (eventType) {
    case 'tournament':
      return 'TOURNAMENT'
    case 'coaching':
      return 'COACHING'
    case 'open_casual':
    case 'open_ranked':
    case 'club_casual':
    case 'club_ranked':
      return 'OPEN PLAY'
    default:
      return String(eventType).replace(/_/g, ' ').toUpperCase()
  }
}

/**
 * The qualifiers under the headline: ranked or casual, club-only, and for open
 * play the singles/doubles format. Returned as parts so a caller can join them
 * however its layout needs.
 */
export function eventKindQualifiers(
  event: Pick<EventDto, 'event_type' | 'match_format' | 'affects_rating'>
): string[] {
  const parts: string[] = []

  if (event.event_type === 'tournament') {
    return parts
  }

  // A coaching session has no ranked/casual distinction and no format — it is
  // a lesson, not a contest, so those qualifiers would say nothing true.
  if (event.event_type === 'coaching') {
    return parts
  }

  if (event.event_type === 'club_casual' || event.event_type === 'club_ranked') {
    parts.push('Club only')
  }

  parts.push(event.affects_rating ? 'Ranked' : 'Casual')

  if (event.match_format) {
    parts.push(event.match_format === 'singles' ? 'Singles' : 'Doubles')
  }

  return parts
}

/** Full one-line description, e.g. "Open Play · Ranked · Doubles". */
export function eventKindSummary(
  event: Pick<EventDto, 'event_type' | 'match_format' | 'affects_rating'>
): string {
  const head = eventKindLabel(event.event_type)
  const rest = eventKindQualifiers(event)
  const title = head.charAt(0) + head.slice(1).toLowerCase()
  return [title, ...rest].join(' · ')
}

/**
 * Broad kind, for filtering. Deliberately coarser than `event_type`: someone
 * browsing wants "show me tournaments", not "show me club_ranked".
 */
export type EventKindFilter = 'all' | 'open_play' | 'tournament' | 'coaching'

export const EVENT_KIND_FILTERS: { value: EventKindFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'open_play', label: 'Open Play' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'coaching', label: 'Coaching' }
]

/** The `event_type` values a broad filter covers, or undefined for "all". */
export function eventTypesForFilter(filter: EventKindFilter): EventType[] | undefined {
  switch (filter) {
    case 'tournament':
      return ['tournament']
    case 'coaching':
      return ['coaching']
    case 'open_play':
      return ['open_casual', 'open_ranked', 'club_casual', 'club_ranked']
    default:
      return undefined
  }
}
