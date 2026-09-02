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
    case 'open_ranked':
    case 'club_ranked':
      // Named apart from casual play because it is the one thing on the card
      // that decides whether the session moves the reader's rating.
      return 'RANKED PLAY'
    case 'open_casual':
    case 'club_casual':
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

/**
 * How a card dresses itself for each kind of event.
 *
 * Every event card used to take a gradient hashed from its *name*, so the five
 * sessions a club runs looked like five unrelated products and two unrelated
 * events could look like the same one. Keying the treatment to `event_type`
 * instead makes the artwork carry information: a tournament always looks like a
 * tournament, and a ranked night never looks like a casual one.
 *
 * The artwork itself is the supplied illustration set, served from
 * `public/event-art/`: a background per kind and the ribbon plate its label sits
 * on. They are files rather than drawn-in-Vue SVG so the design can be re-cut
 * without touching the app — replacing a file replaces the card.
 *
 * There are four looks, one per thing a player actually chooses between —
 * casual open play, ranked open play, a tournament, a coaching session.
 *
 * `art` and `badge` are the matching hue as semantic tokens (docs/33 §3), for
 * the places off the card that name the type in text; the class strings are
 * written out in full because Tailwind cannot see a class assembled at runtime.
 */
export interface EventTypeStyle {
  /** Full-bleed artwork behind the card header. */
  background: string
  /** The ribbon plate the type label is laid over. */
  ribbon: string
  /** The type's hue as text, for callers that name it away from the artwork. */
  art: string
  /** The same hue as a fill. */
  badge: string
  /** Glyph the ribbon plate carries, mirrored by callers without the artwork. */
  icon: 'trophy' | 'paddle' | 'players' | 'star' | 'user'
}

/**
 * Club-only play wears the same artwork as public play.
 *
 * "Club only" is a gate on who may register, not a different activity, and the
 * event page says it in words. What changes the card is whether the session is
 * ranked, so `club_casual` dresses as casual and `club_ranked` as ranked.
 */
const CASUAL_STYLE: EventTypeStyle = {
  background: '/event-art/backgrounds/bg-open-play.svg',
  ribbon: '/event-art/headers/header-open-play.svg',
  art: 'text-info',
  badge: 'bg-info text-on-primary',
  icon: 'paddle'
}

const RANKED_STYLE: EventTypeStyle = {
  background: '/event-art/backgrounds/bg-ranked-night.svg',
  ribbon: '/event-art/headers/header-ranked-night.svg',
  art: 'text-ranked',
  badge: 'bg-ranked text-on-primary',
  icon: 'star'
}

const EVENT_TYPE_STYLES: Record<EventType, EventTypeStyle> = {
  tournament: {
    background: '/event-art/backgrounds/bg-tournament.svg',
    ribbon: '/event-art/headers/header-tournament.svg',
    art: 'text-rating-gold',
    badge: 'bg-rating-gold text-on-primary',
    icon: 'trophy'
  },
  open_ranked: RANKED_STYLE,
  club_ranked: RANKED_STYLE,
  open_casual: CASUAL_STYLE,
  club_casual: CASUAL_STYLE,
  coaching: {
    background: '/event-art/backgrounds/bg-coaching.svg',
    ribbon: '/event-art/headers/header-coaching.svg',
    art: 'text-coach',
    badge: 'bg-coach text-on-primary',
    icon: 'user'
  }
}

/** Falls back to the casual open-play treatment for a type this build has not met. */
export function eventTypeStyle(eventType: EventType | string): EventTypeStyle {
  return EVENT_TYPE_STYLES[eventType as EventType] ?? EVENT_TYPE_STYLES.open_casual
}
